"""Predict PM2.5 at a user-supplied coordinate and time."""
from __future__ import annotations

from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from typing import Any

import joblib
import numpy as np
import pandas as pd
import requests

from aerogrid.config import (
    CITIES, LOCAL_TIMEZONE, OPEN_METEO_ARCHIVE_URL,
    OPEN_METEO_FORECAST_URL, WEATHER_VARIABLES, City, get_city,
)
from aerogrid.features import drop_future_rows, make_model_features
from aerogrid.fetch_data import fetch_elevation, fetch_aod_for_location


def _weather_payload(url: str, params: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(url, params=params, timeout=45, headers={"User-Agent": "AeroGrid-Student-Research/0.1"})
    response.raise_for_status()
    return response.json()


def get_weather_at(latitude: float, longitude: float, timestamp_utc: pd.Timestamp) -> dict[str, Any]:
    """Fetch weather for the requested hour from Open-Meteo archive/forecast."""
    target = pd.Timestamp(timestamp_utc)
    if target.tzinfo is None:
        target = target.tz_localize("UTC")
    else:
        target = target.tz_convert("UTC")
    target = target.floor("h")
    now_utc = pd.Timestamp.now(tz="UTC")
    hourly = ",".join(WEATHER_VARIABLES)

    if target < now_utc - pd.Timedelta(days=7):
        url = OPEN_METEO_ARCHIVE_URL
        params = {
            "latitude": latitude, "longitude": longitude,
            "start_date": target.date().isoformat(),
            "end_date": target.date().isoformat(),
            "hourly": hourly, "timezone": "GMT",
        }
    else:
        # Forecast API supports recent past days as well as forecast days.
        if target > now_utc + pd.Timedelta(days=15):
            raise ValueError("Choose a date within the recent past or roughly the next 15 days so weather data is available.")
        url = OPEN_METEO_FORECAST_URL
        params = {
            "latitude": latitude, "longitude": longitude,
            "hourly": hourly, "timezone": "GMT",
            "past_days": 7, "forecast_days": 16,
        }

    payload = _weather_payload(url, params)
    hourly_data = payload.get("hourly") or {}
    times = hourly_data.get("time") or []
    if not times:
        raise RuntimeError("Weather provider returned no hourly data for this coordinate/date.")
    time_index = pd.to_datetime(times, utc=True)
    diffs = np.abs((time_index - target).total_seconds())
    best_idx = int(np.argmin(diffs))
    if diffs[best_idx] > 3600:
        raise RuntimeError("Weather provider did not return a value close enough to the selected hour.")

    output: dict[str, Any] = {"timestamp_utc": target}
    for variable in WEATHER_VARIABLES:
        values = hourly_data.get(variable) or []
        output[variable] = values[best_idx] if best_idx < len(values) else np.nan
    return output


def local_datetime_to_utc(local_datetime: datetime, timezone_name: str = LOCAL_TIMEZONE) -> pd.Timestamp:
    ts = pd.Timestamp(local_datetime)
    if ts.tzinfo is None:
        ts = ts.tz_localize(ZoneInfo(timezone_name), ambiguous="raise", nonexistent="shift_forward")
    else:
        ts = ts.tz_convert(ZoneInfo(timezone_name))
    return ts.tz_convert("UTC").floor("h")


def load_model(pollutant: str, city: City | None = None) -> dict[str, Any]:
    pollutant = pollutant.lower().replace(".", "")
    if pollutant == "pm25":
        pollutant = "pm25"
    elif pollutant == "pm10":
        raise ValueError("PM10 has been removed: under station-held-out validation it was no better than predicting the typical value.")
    else:
        raise ValueError("Pollutant must be pm25.")
    city = city or get_city()
    path = city.model_dir / f"{pollutant}_model.joblib"
    if not path.exists():
        raise FileNotFoundError(f"Model not found at {path}. Run python -m aerogrid.train --city {city.id} first.")
    return joblib.load(path)


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_km = 6371.0088
    phi1, phi2 = np.radians(lat1), np.radians(lat2)
    dphi = np.radians(lat2 - lat1)
    dlambda = np.radians(lon2 - lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(phi1) * np.cos(phi2) * np.sin(dlambda / 2) ** 2
    return float(2 * radius_km * np.arcsin(np.sqrt(np.clip(a, 0, 1))))


def idw_from_available_readings(pollutant: str, latitude: float, longitude: float,
                                timestamp_utc: pd.Timestamp, max_time_difference_hours: int = 3,
                                power: float = 2.0, city: City | None = None) -> dict[str, Any] | None:
    """Compute an IDW comparator from station observations near the selected time.

    Only observations in the downloaded dataset are used. This is unavailable for future
    dates or times outside that dataset and is clearly marked as such by the caller.
    """
    path = (city or get_city()).dataset_path
    if not path.exists():
        return None
    frame = drop_future_rows(pd.read_csv(path))
    frame["pollutant"] = frame["pollutant"].astype(str).str.lower()
    frame = frame.loc[frame["pollutant"] == pollutant.lower()].copy()
    if frame.empty:
        return None
    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    frame["value_ugm3"] = pd.to_numeric(frame["value_ugm3"], errors="coerce")
    frame = frame.dropna(subset=["timestamp_utc", "value_ugm3", "latitude", "longitude", "location_id"])
    target = pd.Timestamp(timestamp_utc)
    if target.tzinfo is None:
        target = target.tz_localize("UTC")
    else:
        target = target.tz_convert("UTC")
    frame["time_delta_hours"] = (frame["timestamp_utc"] - target).abs().dt.total_seconds() / 3600
    frame = frame.loc[frame["time_delta_hours"] <= max_time_difference_hours].copy()
    if frame.empty:
        return None
    # For each station use its closest-in-time row, rather than weighting sites with many sensors.
    frame = frame.sort_values("time_delta_hours").drop_duplicates("location_id", keep="first")
    frame["distance_km"] = [
        haversine_km(latitude, longitude, float(row.latitude), float(row.longitude))
        for row in frame.itertuples(index=False)
    ]
    exact = frame.loc[frame["distance_km"] < 0.05]
    if not exact.empty:
        value = float(exact.iloc[0]["value_ugm3"])
        return {"value_ugm3": value, "stations_used": 1, "nearest_station_km": float(exact.iloc[0]["distance_km"]), "method": "near-exact station record"}
    frame = frame.loc[frame["distance_km"] > 0.01].copy()
    if frame.empty:
        return None
    frame["weight"] = 1.0 / np.power(frame["distance_km"].to_numpy(), power)
    estimate = float(np.average(frame["value_ugm3"], weights=frame["weight"]))
    return {
        "value_ugm3": estimate,
        "stations_used": int(len(frame)),
        "nearest_station_km": float(frame["distance_km"].min()),
        "method": f"IDW (power={power:g}) from downloaded readings within ±{max_time_difference_hours}h",
    }


def predict_location(pollutant: str, latitude: float, longitude: float,
                     local_datetime: datetime, city: City | None = None) -> dict[str, Any]:
    city = city or get_city()
    bundle = load_model(pollutant, city)
    # dist_to_center_km must use the centre the model was trained with.
    center = tuple(bundle.get("center") or (city.latitude, city.longitude))
    timestamp_utc = local_datetime_to_utc(local_datetime, bundle.get("timezone", LOCAL_TIMEZONE))
    weather = get_weather_at(latitude, longitude, timestamp_utc)

    # Elevation — free from Open-Meteo, no API key
    elevation = fetch_elevation(latitude, longitude)

    # Satellite AOD — free CAMS data via Open-Meteo Air Quality API
    aod_frame = fetch_aod_for_location(latitude, longitude, timestamp_utc.date(), timestamp_utc.date())
    aod_value = np.nan
    if not aod_frame.empty:
        aod_match = aod_frame.loc[aod_frame["timestamp_utc"] == timestamp_utc, "aerosol_optical_depth"]
        if not aod_match.empty:
            aod_value = float(aod_match.iloc[0])
        elif not aod_frame["aerosol_optical_depth"].isna().all():
            # Use the closest available hour
            aod_value = float(aod_frame["aerosol_optical_depth"].dropna().iloc[0])

    weather_row = {
        "latitude": float(latitude), "longitude": float(longitude),
        "timestamp_utc": timestamp_utc,
        "elevation_m": elevation if elevation is not None else np.nan,
        "aerosol_optical_depth": aod_value,
        **{name: weather.get(name, np.nan) for name in WEATHER_VARIABLES},
    }
    target_row = pd.DataFrame([{**weather_row, "location_id": "__AEROGRID_TARGET__"}])
    reference_path = city.dataset_path
    reference = drop_future_rows(pd.read_csv(reference_path)) if reference_path.exists() else pd.DataFrame()
    if not reference.empty:
        reference["pollutant"] = reference["pollutant"].astype(str).str.lower()
        reference = reference.loc[reference["pollutant"] == bundle["pollutant"]].copy()
        reference["timestamp_utc"] = pd.to_datetime(reference["timestamp_utc"], utc=True, errors="coerce")
    X = make_model_features(target_row, reference, bundle.get("timezone", LOCAL_TIMEZONE), center)
    neighbour_count = float(X.iloc[0].get("neighbor_count", 0.0))
    nearest_distance = X.iloc[0].get("nearest_station_distance_km")
    prediction = float(max(0.0, bundle["model"].predict(X)[0]))
    idw = idw_from_available_readings(pollutant, latitude, longitude, timestamp_utc, city=city)
    return {
        "pollutant": bundle["pollutant"],
        "city": city.id,
        "latitude": float(latitude),
        "longitude": float(longitude),
        "timestamp_local": pd.Timestamp(local_datetime).isoformat(),
        "timestamp_utc": timestamp_utc.isoformat(),
        "ml_prediction_ugm3": prediction,
        "neighbor_count_used_by_model": int(neighbour_count),
        "nearest_station_distance_km_used_by_model": None if pd.isna(nearest_distance) else float(nearest_distance),
        "weather": weather,
        "elevation_m": elevation,
        "aerosol_optical_depth": None if np.isnan(aod_value) else aod_value,
        "idw_comparison": idw,
        "metrics": bundle["metrics"],
        "training_median": bundle.get("training_median"),
        "trained_at_utc": bundle.get("trained_at_utc"),
    }


def main() -> None:
    import argparse
    import json

    parser = argparse.ArgumentParser(description="Predict PM2.5 at a latitude/longitude.")
    parser.add_argument("--pollutant", choices=["pm25"], default="pm25")
    parser.add_argument("--city", choices=sorted(CITIES), default=None)
    parser.add_argument("--lat", type=float, required=True)
    parser.add_argument("--lon", type=float, required=True)
    parser.add_argument("--datetime", required=True, help="Local datetime, e.g. 2026-10-10T14:00")
    args = parser.parse_args()
    local_dt = datetime.fromisoformat(args.datetime)
    result = predict_location(args.pollutant, args.lat, args.lon, local_dt, get_city(args.city))
    # Omit the model object and print only result metadata.
    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
