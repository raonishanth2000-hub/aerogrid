"""Feature engineering shared by model training and inference."""
from __future__ import annotations

import numpy as np
import pandas as pd

from aerogrid.config import CENTER_LAT, CENTER_LON, FEATURE_COLUMNS, LOCAL_TIMEZONE, WEATHER_VARIABLES
from aerogrid.geo import get_geo_features


def drop_future_rows(frame: pd.DataFrame, column: str = "timestamp_utc") -> pd.DataFrame:
    """Remove rows timestamped after now.

    Some sources (e.g. the CAMS feed behind Open-Meteo) mix forecasts into the same series;
    a forecast is not an observation, so it must not be used as a training label or as a
    "nearby reading".
    """
    if frame.empty or column not in frame.columns:
        return frame
    stamps = pd.to_datetime(frame[column], utc=True, errors="coerce")
    return frame.loc[stamps <= pd.Timestamp.now(tz="UTC")].copy()


def make_features(frame: pd.DataFrame, timezone: str = LOCAL_TIMEZONE,
                  center: tuple[float, float] = (CENTER_LAT, CENTER_LON)) -> pd.DataFrame:
    """Build a consistent feature matrix from observation or prediction rows.

    Required input columns: latitude, longitude, timestamp_utc and weather variables.
    Missing weather data is left as NaN so the model pipeline can impute it.
    `center` is the study-area centre used for dist_to_center_km; it must match training.
    """
    required = {"latitude", "longitude", "timestamp_utc"}
    missing = required.difference(frame.columns)
    if missing:
        raise ValueError(f"Missing required feature input columns: {sorted(missing)}")

    timestamps = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    if timestamps.isna().any():
        raise ValueError("Some timestamp_utc values could not be parsed.")
    local = timestamps.dt.tz_convert(timezone)

    output = pd.DataFrame(index=frame.index)
    output["latitude"] = pd.to_numeric(frame["latitude"], errors="coerce")
    output["longitude"] = pd.to_numeric(frame["longitude"], errors="coerce")

    # Elevation — pre-fetched by fetch_data and stored in the CSV; during prediction
    # it comes from the predict.py call to fetch_elevation().
    output["elevation_m"] = pd.to_numeric(frame["elevation_m"], errors="coerce") if "elevation_m" in frame.columns else np.nan

    for column in WEATHER_VARIABLES:
        output[column] = pd.to_numeric(frame[column], errors="coerce") if column in frame else np.nan

    # Satellite AOD — stored in the CSV (training) or fetched live (prediction)
    output["aerosol_optical_depth"] = (
        pd.to_numeric(frame["aerosol_optical_depth"], errors="coerce")
        if "aerosol_optical_depth" in frame.columns else np.nan
    )

    # Neighbor features are added with leakage-safe station readings below.
    output["idw_neighbor_pm"] = np.nan
    output["nearest_neighbor_pm"] = np.nan
    output["second_neighbor_pm"] = np.nan
    output["nearest_station_distance_km"] = np.nan
    output["neighbor_count"] = 0.0

    wind_radians = np.deg2rad(output["wind_direction_10m"])
    output["wind_direction_sin"] = np.sin(wind_radians)
    output["wind_direction_cos"] = np.cos(wind_radians)
    output["wind_u"] = -output["wind_speed_10m"] * output["wind_direction_sin"]
    output["wind_v"] = -output["wind_speed_10m"] * output["wind_direction_cos"]

    output["dist_to_center_km"] = _haversine_vector(
        center[0], center[1],
        output["latitude"].to_numpy(), output["longitude"].to_numpy()
    )

    hour = local.dt.hour + local.dt.minute / 60.0
    output["hour_sin"] = np.sin(2 * np.pi * hour / 24.0)
    output["hour_cos"] = np.cos(2 * np.pi * hour / 24.0)

    day_of_year = local.dt.dayofyear.astype(float)
    output["dayofyear_sin"] = np.sin(2 * np.pi * day_of_year / 365.25)
    output["dayofyear_cos"] = np.cos(2 * np.pi * day_of_year / 365.25)

    weekday = local.dt.dayofweek.astype(float)
    output["weekday_sin"] = np.sin(2 * np.pi * weekday / 7.0)
    output["weekday_cos"] = np.cos(2 * np.pi * weekday / 7.0)

    output["road_density_2km"] = np.nan
    output["dist_to_major_road_m"] = np.nan

    unique_coords = output[["latitude", "longitude"]].drop_duplicates()
    for row in unique_coords.itertuples(index=False):
        if pd.isna(row.latitude) or pd.isna(row.longitude):
            continue
        geo = get_geo_features(row.latitude, row.longitude)
        
        # Avoid float comparison issues by applying where both match exactly
        mask = (output["latitude"] == row.latitude) & (output["longitude"] == row.longitude)
        output.loc[mask, "road_density_2km"] = geo["road_density_2km"]
        output.loc[mask, "dist_to_major_road_m"] = geo["dist_to_major_road_m"]

    # Only return columns present in output (if FEATURE_COLUMNS has more, it will fail unless they exist)
    return output[FEATURE_COLUMNS]


def _haversine_vector(lat: float, lon: float, lats: np.ndarray, lons: np.ndarray) -> np.ndarray:
    """Vectorized Haversine distance in kilometres."""
    radius = 6371.0088
    phi1 = np.radians(lat)
    phi2 = np.radians(lats.astype(float))
    dphi = np.radians(lats.astype(float) - lat)
    dlambda = np.radians(lons.astype(float) - lon)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2) ** 2
    return 2 * radius * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def make_neighbor_features(target_frame: pd.DataFrame, reference_frame: pd.DataFrame,
                           max_neighbors: int = 5, time_window_hours: int = 1,
                           power: float = 2.0) -> pd.DataFrame:
    """Calculate same-time neighbouring PM features without using a target site's own readings.

    `reference_frame` must contain only stations that are allowed to be known for the
    given experiment. During held-out-location testing, pass the training stations only.
    """
    output = pd.DataFrame(index=target_frame.index)
    output["idw_neighbor_pm"] = np.nan
    output["nearest_neighbor_pm"] = np.nan
    output["second_neighbor_pm"] = np.nan
    output["nearest_station_distance_km"] = np.nan
    output["neighbor_count"] = 0.0

    required_ref = {"timestamp_utc", "location_id", "latitude", "longitude", "value_ugm3"}
    if reference_frame.empty or not required_ref.issubset(reference_frame.columns):
        return output

    ref = reference_frame[list(required_ref)].copy()
    ref["timestamp_utc"] = pd.to_datetime(ref["timestamp_utc"], utc=True, errors="coerce").dt.floor("h")
    ref["value_ugm3"] = pd.to_numeric(ref["value_ugm3"], errors="coerce")
    ref["latitude"] = pd.to_numeric(ref["latitude"], errors="coerce")
    ref["longitude"] = pd.to_numeric(ref["longitude"], errors="coerce")
    ref = ref.dropna(subset=["timestamp_utc", "location_id", "latitude", "longitude", "value_ugm3"])
    if ref.empty:
        return output

    by_time = {stamp: group for stamp, group in ref.groupby("timestamp_utc", sort=False)}
    target_times = pd.to_datetime(target_frame["timestamp_utc"], utc=True, errors="coerce").dt.floor("h")
    for stamp, target_group in target_frame.groupby(target_times, sort=False):
        candidate_groups = []
        for offset in range(-time_window_hours, time_window_hours + 1):
            candidate_stamp = stamp + pd.Timedelta(hours=offset)
            if candidate_stamp in by_time:
                candidate_groups.append(by_time[candidate_stamp])
        if not candidate_groups:
            continue
        candidates = pd.concat(candidate_groups, ignore_index=True).drop_duplicates(
            ["location_id", "timestamp_utc"], keep="first"
        )

        for idx, target in target_group.iterrows():
            target_location = str(target.get("location_id", "__TARGET__"))
            usable = candidates.loc[candidates["location_id"].astype(str) != target_location].copy()
            if usable.empty:
                continue
            usable["time_diff"] = (usable["timestamp_utc"] - stamp).abs().dt.total_seconds() / 3600.0
            usable = usable.sort_values("time_diff").drop_duplicates("location_id", keep="first")
            distances = _haversine_vector(
                float(target["latitude"]), float(target["longitude"]),
                usable["latitude"].to_numpy(), usable["longitude"].to_numpy()
            )
            usable["distance_km"] = distances
            usable = usable.loc[usable["distance_km"] > 0.01].sort_values("distance_km").head(max_neighbors).copy()
            if usable.empty:
                continue
            d = usable["distance_km"].to_numpy(dtype=float)
            values = usable["value_ugm3"].to_numpy(dtype=float)
            weights = 1.0 / np.power(np.maximum(d, 0.01), power)
            output.at[idx, "idw_neighbor_pm"] = float(np.average(values, weights=weights))
            output.at[idx, "nearest_neighbor_pm"] = float(values[0])
            if len(values) > 1:
                output.at[idx, "second_neighbor_pm"] = float(values[1])
            output.at[idx, "nearest_station_distance_km"] = float(d[0])
            output.at[idx, "neighbor_count"] = float(len(values))
    return output


def make_model_features(target_frame: pd.DataFrame, reference_frame: pd.DataFrame,
                        timezone: str = LOCAL_TIMEZONE,
                        center: tuple[float, float] = (CENTER_LAT, CENTER_LON)) -> pd.DataFrame:
    """Combine coordinate/weather/time and leakage-safe nearby-measurement features."""
    base = make_features(target_frame, timezone, center)
    neighbors = make_neighbor_features(target_frame, reference_frame)
    for column in neighbors.columns:
        base[column] = neighbors[column]
    return base[FEATURE_COLUMNS]
