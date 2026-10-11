"""AeroGrid Feature Engineering Pipeline.

Computes 26 spatial, meteorological, atmospheric, cyclical-temporal, and land-use
features used by the HistGradientBoosting and Random Forest models.
"""
from __future__ import annotations

import math
from typing import Any, List, Optional
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd

from ml.geo import get_geo_features

FEATURE_COLUMNS = [
    "latitude",
    "longitude",
    "elevation_m",
    "idw_neighbor_pm",
    "nearest_neighbor_pm",
    "second_neighbor_pm",
    "nearest_station_distance_km",
    "neighbor_count",
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_sin",
    "wind_direction_cos",
    "pressure_msl",
    "aerosol_optical_depth",
    "hour_sin",
    "hour_cos",
    "dayofyear_sin",
    "dayofyear_cos",
    "weekday_sin",
    "weekday_cos",
    "road_density_2km",
    "dist_to_major_road_m",
    "dist_to_center_km",
    "wind_u",
    "wind_v",
]

DEFAULT_CENTER_LAT = 28.6139
DEFAULT_CENTER_LON = 77.2090


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km between two lat/lon coordinates."""
    radius_km = 6371.0088
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2.0) ** 2
    return float(2.0 * radius_km * math.asin(math.sqrt(max(0.0, min(1.0, a)))))


def make_model_features(
    targets: pd.DataFrame,
    reference: pd.DataFrame,
    timezone_name: str = "Asia/Kolkata",
    center_lat: float = DEFAULT_CENTER_LAT,
    center_lon: float = DEFAULT_CENTER_LON,
) -> pd.DataFrame:
    """Build the canonical 26-feature matrix for target coordinates.

    Strictly avoids data leakage: reference stations matching target location_id
    are excluded when calculating spatial neighbor features.
    """
    rows: List[dict[str, Any]] = []

    # Prepare reference pool if present
    ref_df = reference.copy() if reference is not None and not reference.empty else pd.DataFrame()
    if not ref_df.empty:
        if "timestamp_utc" in ref_df.columns:
            ref_df["timestamp_utc"] = pd.to_datetime(ref_df["timestamp_utc"], utc=True, errors="coerce")
        # Ensure value column is numeric
        val_col = "value_ugm3" if "value_ugm3" in ref_df.columns else "value"
        if val_col in ref_df.columns:
            ref_df["_pm_val"] = pd.to_numeric(ref_df[val_col], errors="coerce")
        else:
            ref_df["_pm_val"] = np.nan

    for _, target in targets.iterrows():
        t_lat = float(target["latitude"])
        t_lon = float(target["longitude"])
        t_loc_id = str(target.get("location_id", ""))

        # 1. Spatial Neighbor Features
        neighbor_count = 0
        dist_nearest = np.nan
        nearest_pm = np.nan
        second_pm = np.nan
        idw_pm = np.nan

        if not ref_df.empty and "_pm_val" in ref_df.columns:
            # Exclude self-station to eliminate target leakage
            cand = ref_df.loc[ref_df["location_id"].astype(str) != t_loc_id].dropna(subset=["_pm_val", "latitude", "longitude"])
            if not cand.empty:
                # If target has a timestamp, optionally constrain or weight closest time
                t_ts = target.get("timestamp_utc")
                if t_ts is not None and pd.notna(t_ts) and "timestamp_utc" in cand.columns:
                    target_time = pd.Timestamp(t_ts)
                    cand = cand.copy()
                    cand["time_diff_h"] = (cand["timestamp_utc"] - target_time).abs().dt.total_seconds() / 3600.0
                    cand_recent = cand.loc[cand["time_diff_h"] <= 3.0]
                    if not cand_recent.empty:
                        cand = cand_recent.sort_values("time_diff_h").drop_duplicates("location_id", keep="first")

                distances = [haversine_km(t_lat, t_lon, float(r.latitude), float(r.longitude)) for r in cand.itertuples()]
                cand = cand.copy()
                cand["_dist_km"] = distances
                cand = cand.sort_values("_dist_km")

                neighbor_count = int(len(cand))
                if neighbor_count > 0:
                    dist_nearest = float(cand.iloc[0]["_dist_km"])
                    nearest_pm = float(cand.iloc[0]["_pm_val"])
                    second_pm = float(cand.iloc[1]["_pm_val"]) if neighbor_count > 1 else nearest_pm

                    weights = 1.0 / np.power(np.maximum(cand["_dist_km"].to_numpy(), 0.05), 2.0)
                    idw_pm = float(np.average(cand["_pm_val"].to_numpy(), weights=weights))

        # 2. Weather Variables
        temp = float(target.get("temperature_2m", np.nan))
        rh = float(target.get("relative_humidity_2m", np.nan))
        ws = float(target.get("wind_speed_10m", np.nan))
        pressure = float(target.get("pressure_msl", np.nan))
        wd = float(target.get("wind_direction_10m", np.nan))

        if pd.notna(wd):
            wd_rad = math.radians(wd)
            wd_sin = math.sin(wd_rad)
            wd_cos = math.cos(wd_rad)
            wind_u = -ws * wd_sin if pd.notna(ws) else np.nan
            wind_v = -ws * wd_cos if pd.notna(ws) else np.nan
        else:
            wd_sin, wd_cos, wind_u, wind_v = np.nan, np.nan, np.nan, np.nan

        # 3. Temporal Cyclical Variables
        t_raw = target.get("timestamp_utc", target.get("timestamp"))
        if t_raw is not None and pd.notna(t_raw):
            try:
                ts = pd.Timestamp(t_raw)
                if ts.tzinfo is None:
                    ts = ts.tz_localize("UTC")
                ts_local = ts.tz_convert(ZoneInfo(timezone_name))
                hour = ts_local.hour + ts_local.minute / 60.0
                dayofyear = ts_local.dayofyear
                weekday = ts_local.weekday()

                hour_sin = math.sin(2.0 * math.pi * hour / 24.0)
                hour_cos = math.cos(2.0 * math.pi * hour / 24.0)
                doy_sin = math.sin(2.0 * math.pi * dayofyear / 365.25)
                doy_cos = math.cos(2.0 * math.pi * dayofyear / 365.25)
                wk_sin = math.sin(2.0 * math.pi * weekday / 7.0)
                wk_cos = math.cos(2.0 * math.pi * weekday / 7.0)
            except Exception:
                hour_sin = hour_cos = doy_sin = doy_cos = wk_sin = wk_cos = 0.0
        else:
            hour_sin = hour_cos = doy_sin = doy_cos = wk_sin = wk_cos = 0.0

        # 4. Land and Atmospheric Variables
        elevation = target.get("elevation_m")
        elev_val = float(elevation) if elevation is not None and pd.notna(elevation) else np.nan

        aod = target.get("aerosol_optical_depth")
        aod_val = float(aod) if aod is not None and pd.notna(aod) else np.nan

        # Road density and distance to major road
        rd = target.get("road_density_2km")
        dist_road = target.get("dist_to_major_road_m")
        if rd is not None and pd.notna(rd) and dist_road is not None and pd.notna(dist_road):
            road_density = float(rd)
            dist_to_major_road = float(dist_road)
        else:
            try:
                geo_info = get_geo_features(t_lat, t_lon)
                road_density = float(geo_info.get("road_density_2km", 0.0))
                dist_to_major_road = float(geo_info.get("dist_to_major_road_m", 1000.0))
            except Exception:
                road_density = 0.0
                dist_to_major_road = 1000.0

        dist_to_center = haversine_km(t_lat, t_lon, center_lat, center_lon)

        row_dict = {
            "latitude": t_lat,
            "longitude": t_lon,
            "elevation_m": elev_val,
            "idw_neighbor_pm": idw_pm,
            "nearest_neighbor_pm": nearest_pm,
            "second_neighbor_pm": second_pm,
            "nearest_station_distance_km": dist_nearest,
            "neighbor_count": neighbor_count,
            "temperature_2m": temp,
            "relative_humidity_2m": rh,
            "wind_speed_10m": ws,
            "wind_direction_sin": wd_sin,
            "wind_direction_cos": wd_cos,
            "pressure_msl": pressure,
            "aerosol_optical_depth": aod_val,
            "hour_sin": hour_sin,
            "hour_cos": hour_cos,
            "dayofyear_sin": doy_sin,
            "dayofyear_cos": doy_cos,
            "weekday_sin": wk_sin,
            "weekday_cos": wk_cos,
            "road_density_2km": road_density,
            "dist_to_major_road_m": dist_to_major_road,
            "dist_to_center_km": dist_to_center,
            "wind_u": wind_u,
            "wind_v": wind_v,
        }
        rows.append(row_dict)

    df_out = pd.DataFrame(rows)
    return df_out[FEATURE_COLUMNS]
