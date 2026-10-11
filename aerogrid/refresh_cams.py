"""Refresh a CAMS-based city dataset (Delhi) from the Open-Meteo air-quality and weather APIs.

Open-Meteo returns CAMS analysis for past hours and forecasts for future hours in one series.
A dataset saved days ago therefore holds forecasts for hours that have since passed, and those
forecasts can be far from what CAMS later reported. This rebuilds the last `past_days` days for
every station in the dataset and keeps only hours that have already happened at refresh time.

    python -m aerogrid.refresh_cams            # refresh Delhi
"""
from __future__ import annotations

import argparse
import threading
import time

import pandas as pd
import requests

from aerogrid.config import (
    OPEN_METEO_AIR_QUALITY_URL, OPEN_METEO_FORECAST_URL, WEATHER_VARIABLES, City, get_city,
)

_HEADERS = {"User-Agent": "AeroGrid-Research/0.1"}
_lock = threading.Lock()
_last_attempt: dict[str, float] = {}


def _hourly_frames(url: str, stations: pd.DataFrame, variables: list[str], past_days: int) -> list[pd.DataFrame]:
    """One request for all stations (Open-Meteo accepts comma-separated coordinates)."""
    params = {
        "latitude": ",".join(f"{v:.4f}" for v in stations["latitude"]),
        "longitude": ",".join(f"{v:.4f}" for v in stations["longitude"]),
        "hourly": ",".join(variables),
        "past_days": past_days,
        "forecast_days": 1,
        "timezone": "GMT",
    }
    response = requests.get(url, params=params, timeout=60, headers=_HEADERS)
    response.raise_for_status()
    payload = response.json()
    payload = payload if isinstance(payload, list) else [payload]
    if len(payload) != len(stations):
        raise RuntimeError(f"Expected {len(stations)} locations from {url}, got {len(payload)}.")
    frames = []
    for item in payload:
        hourly = item["hourly"]
        frame = pd.DataFrame({"timestamp_utc": pd.to_datetime(hourly["time"], utc=True)})
        for variable in variables:
            frame[variable] = pd.to_numeric(pd.Series(hourly.get(variable)), errors="coerce")
        frames.append(frame)
    return frames


def refresh(city: City | None = None, past_days: int = 7) -> int:
    """Rewrite the city's dataset with CAMS values up to the current hour. Returns the row count."""
    city = city or get_city("delhi")
    if city.data_kind != "modelled":
        raise ValueError(f"{city.name} uses measured data; only CAMS-based (modelled) cities can be refreshed here.")
    existing = pd.read_csv(city.dataset_path)
    stations = (
        existing.sort_values("timestamp_utc")
        .groupby("location_id", as_index=False)
        .last()[["location_id", "location_name", "latitude", "longitude", "elevation_m"]]
    )
    now = pd.Timestamp.now(tz="UTC").floor("h")
    air = _hourly_frames(OPEN_METEO_AIR_QUALITY_URL, stations, ["pm2_5", "aerosol_optical_depth"], past_days)
    weather = _hourly_frames(OPEN_METEO_FORECAST_URL, stations, list(WEATHER_VARIABLES), past_days)

    rows = []
    for station, aq, wx in zip(stations.itertuples(index=False), air, weather):
        merged = aq.merge(wx, on="timestamp_utc", how="left")
        merged = merged.loc[(merged["timestamp_utc"] <= now) & merged["pm2_5"].notna() & (merged["pm2_5"] >= 0)]
        merged = merged.assign(
            location_id=station.location_id, location_name=station.location_name,
            latitude=station.latitude, longitude=station.longitude, elevation_m=station.elevation_m,
            pollutant="pm25", value_ugm3=merged["pm2_5"].round(1),
        )
        rows.append(merged)
    fresh = pd.concat(rows, ignore_index=True)
    if fresh.empty:
        raise RuntimeError("Open-Meteo returned no past PM2.5 values; dataset left unchanged.")
    fresh["timestamp_utc"] = fresh["timestamp_utc"].map(lambda t: t.isoformat())
    fresh = fresh[list(existing.columns)]
    tmp = city.dataset_path.with_suffix(".tmp")
    fresh.to_csv(tmp, index=False)
    tmp.replace(city.dataset_path)
    return len(fresh)


def refresh_if_stale(city: City, latest: pd.Timestamp | None, max_age_hours: float = 1.0,
                     retry_after_s: float = 900) -> bool:
    """Refresh when the newest row is older than `max_age_hours`; at most one attempt per 15 min.

    Failures are swallowed (the existing data keeps being served and is shown as stale).
    """
    now = pd.Timestamp.now(tz="UTC")
    if latest is not None and now - latest <= pd.Timedelta(hours=max_age_hours + 1):
        return False
    with _lock:
        if time.monotonic() - _last_attempt.get(city.id, -retry_after_s) < retry_after_s:
            return False
        _last_attempt[city.id] = time.monotonic()
        try:
            refresh(city)
            return True
        except Exception as exc:  # network errors etc.: keep serving the existing file
            print(f"CAMS refresh for {city.name} failed: {exc}")
            return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--city", default="delhi")
    parser.add_argument("--past-days", type=int, default=7)
    args = parser.parse_args()
    n = refresh(get_city(args.city), args.past_days)
    print(f"Wrote {n:,} rows to {get_city(args.city).dataset_path}")


if __name__ == "__main__":
    main()
