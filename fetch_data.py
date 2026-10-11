"""Download real hourly air-quality data from OpenAQ and matching weather from Open-Meteo.

Requires an OpenAQ API key. Open-Meteo historical weather access is used for feature data.
"""
from __future__ import annotations

import argparse
import time
from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd
import requests

from aerogrid.config import (
    CENTER_LAT, CENTER_LON, DATA_DIR, EXTRA_STUDY_CENTRES, LOCAL_TIMEZONE,
    OPENAQ_API_KEY, OPENAQ_BASE_URL, OPEN_METEO_AIR_QUALITY_URL,
    OPEN_METEO_ARCHIVE_URL, OPEN_METEO_ELEVATION_URL,
    SEARCH_RADIUS_M, WEATHER_VARIABLES,
)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "AeroGrid-Student-Research/0.1"})


def api_get(url: str, *, params: dict[str, Any] | None = None,
            headers: dict[str, str] | None = None, attempts: int = 5) -> dict[str, Any]:
    """GET JSON with retries for transient failures and rate limits."""
    for attempt in range(attempts):
        try:
            response = SESSION.get(url, params=params, headers=headers, timeout=45)
            if response.status_code == 429 or response.status_code >= 500:
                if attempt < attempts - 1:
                    time.sleep(min(2 ** attempt, 20))
                    continue
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError) as exc:
            if attempt == attempts - 1:
                raise RuntimeError(f"Request failed for {url}: {exc}") from exc
            time.sleep(min(2 ** attempt, 20))
    raise RuntimeError(f"Request failed for {url}")


def normalize_pollutant(name: Any) -> str | None:
    """Return canonical pollutant code pm25 or pm10 from common parameter names."""
    raw = str(name or "").strip().lower().replace("µ", "u")
    compact = "".join(ch for ch in raw if ch.isalnum())
    if compact in {"pm25", "pm2.5", "particulatematter25", "particulatematter25um"}:
        return "pm25"
    if compact in {"pm10", "particulatematter10", "particulatematter10um"}:
        return "pm10"
    if "pm25" in compact:
        return "pm25"
    if "pm10" in compact:
        return "pm10"
    return None


def extract_timestamp(item: dict[str, Any]) -> str | None:
    """Return the UTC (or local) ISO timestamp from an OpenAQ v3 hourly result item.

    The /v3/sensors/{id}/hours endpoint returns the period start time in one of
    three documented shapes depending on sensor type and API version:

    Shape A — flat top-level ``datetimeFrom`` dict (older v3 stations)::

        {"datetimeFrom": {"utc": "2024-01-01T00:00:00Z", "local": "..."}, "value": 12.5}

    Shape B — ``period`` object containing ``datetimeFrom`` (newer v3 stations)::

        {"period": {"label": "1h", "interval": "01:00:00",
                    "datetimeFrom": {"utc": "2024-01-01T00:00:00Z", "local": "..."}},
         "value": 12.5}

    Shape C — top-level ``datetime`` dict holding the *end* of the hour
    (common in live and recent responses; the code floors to the hour so the
    off-by-one second does not matter for hourly aggregates)::

        {"datetime": {"utc": "2024-01-01T01:00:00Z", "local": "..."}, "value": 12.5}

    Returns the UTC string if present, otherwise the local string, otherwise None.
    ``period`` is only treated as a source of ``datetimeFrom`` when it is a dict;
    if it is a plain string such as ``"hourly"`` it is silently skipped.
    """
    # Shape A
    date_obj = item.get("datetimeFrom")
    if isinstance(date_obj, dict):
        ts = date_obj.get("utc") or date_obj.get("local")
        if ts:
            return ts

    # Shape B
    period = item.get("period")
    if isinstance(period, dict):
        date_obj = period.get("datetimeFrom")
        if isinstance(date_obj, dict):
            ts = date_obj.get("utc") or date_obj.get("local")
            if ts:
                return ts

    # Shape C — end-of-period marker; floored to the hour by the caller
    date_obj = item.get("datetime")
    if isinstance(date_obj, dict):
        ts = date_obj.get("utc") or date_obj.get("local")
        if ts:
            return ts

    return None


def normalize_concentration(value: Any, units: Any) -> float | None:
    """Convert supported PM concentration units to µg/m³; reject unknown units."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if not np.isfinite(number) or number < 0:
        return None
    unit = str(units or "").strip().lower().replace("µ", "u").replace("μ", "u")
    unit = unit.replace(" ", "").replace("^", "").replace("³", "3")
    if unit in {"ug/m3", "ugm-3", "micrograms/m3", "microgram/m3"}:
        return number
    if unit in {"mg/m3", "mgm-3"}:
        return number * 1000.0
    # Do not silently mix unknown units with µg/m³.
    return None


def fetch_elevation(lat: float, lon: float) -> float | None:
    """Return terrain elevation in metres from Open-Meteo (free, no key)."""
    try:
        payload = api_get(OPEN_METEO_ELEVATION_URL, params={"latitude": lat, "longitude": lon})
        elevations = payload.get("elevation")
        if elevations:
            return float(elevations[0])
    except Exception:
        pass
    return None


def fetch_aod_for_location(lat: float, lon: float, start_date: date,
                            end_date: date) -> pd.DataFrame:
    """Fetch hourly Aerosol Optical Depth (AOD at 550 nm) from Open-Meteo Air Quality API.

    Data source: CAMS (Copernicus Atmosphere Monitoring Service) — satellite-derived.
    Free, no API key required. Returns a DataFrame with timestamp_utc and aerosol_optical_depth.
    """
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": "aerosol_optical_depth",
        "timezone": "GMT",
    }
    try:
        payload = api_get(OPEN_METEO_AIR_QUALITY_URL, params=params)
        hourly = payload.get("hourly") or {}
        times = hourly.get("time") or []
        if not times:
            return pd.DataFrame(columns=["timestamp_utc", "aerosol_optical_depth"])
        frame = pd.DataFrame({
            "timestamp_utc": pd.to_datetime(times, utc=True),
            "aerosol_optical_depth": hourly.get("aerosol_optical_depth"),
        })
        frame["timestamp_utc"] = frame["timestamp_utc"].dt.floor("h")
        return frame
    except Exception as exc:
        print(f"  WARNING: AOD fetch failed for ({lat:.4f}, {lon:.4f}): {exc}")
        return pd.DataFrame(columns=["timestamp_utc", "aerosol_optical_depth"])


def discover_locations() -> list[dict[str, Any]]:
    """Discover PM sensors across the primary study centre AND extra Indian cities."""
    if not OPENAQ_API_KEY:
        raise RuntimeError(
            "OPENAQ_API_KEY is missing. Copy .env.example to .env and add an API key "
            "from https://explore.openaq.org/register. Never put the key in source code."
        )
    headers = {"X-API-Key": OPENAQ_API_KEY}

    # All search centres: Bengaluru first, then extra cities
    all_centres = [(CENTER_LAT, CENTER_LON)] + [(lat, lon) for _, lat, lon in EXTRA_STUDY_CENTRES]
    all_locations: list[dict[str, Any]] = []
    seen_ids: set[int] = set()

    for centre_lat, centre_lon in all_centres:
        page = 1
        while page <= 20:
            payload = api_get(
                f"{OPENAQ_BASE_URL}/locations",
                params={
                    "coordinates": f"{centre_lat:.4f},{centre_lon:.4f}",
                    "radius": SEARCH_RADIUS_M,
                    "limit": 100,
                    "page": page,
                    "order_by": "id",
                    "sort_order": "asc",
                },
                headers=headers,
            )
            results = payload.get("results") or []
            for loc in results:
                loc_id = loc.get("id")
                if loc_id not in seen_ids:
                    seen_ids.add(loc_id)
                    all_locations.append(loc)
            if len(results) < 100:
                break
            page += 1
            time.sleep(0.15)
        time.sleep(0.3)   # pace between cities

    return all_locations


def fetch_sensor_hours(sensor_id: int, start_date: date, end_date: date) -> list[dict[str, Any]]:
    headers = {"X-API-Key": OPENAQ_API_KEY}
    rows: list[dict[str, Any]] = []
    page = 1
    while page <= 1000:
        payload = api_get(
            f"{OPENAQ_BASE_URL}/sensors/{sensor_id}/hours",
            params={
                "datetime_from": f"{start_date.isoformat()}T00:00:00Z",
                "datetime_to": f"{end_date.isoformat()}T23:59:59Z",
                "limit": 1000,
                "page": page,
            },
            headers=headers,
        )
        results = payload.get("results") or []
        rows.extend(results)
        if len(results) < 1000:
            break
        page += 1
        time.sleep(0.12)
    return rows


def fetch_weather_for_location(lat: float, lon: float, start_date: date,
                               end_date: date) -> pd.DataFrame:
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "hourly": ",".join(WEATHER_VARIABLES),
        "timezone": "GMT",
    }
    payload = api_get(OPEN_METEO_ARCHIVE_URL, params=params)
    hourly = payload.get("hourly") or {}
    times = hourly.get("time") or []
    if not times:
        return pd.DataFrame(columns=["timestamp_utc", *WEATHER_VARIABLES])
    frame = pd.DataFrame({"timestamp_utc": pd.to_datetime(times, utc=True)})
    for variable in WEATHER_VARIABLES:
        values = hourly.get(variable)
        frame[variable] = values if values is not None else np.nan
    frame["timestamp_utc"] = frame["timestamp_utc"].dt.floor("h")
    return frame


def run(start_date: date, end_date: date) -> None:
    if start_date > end_date:
        raise ValueError("Start date must be on or before end date.")
    print(f"Searching OpenAQ locations within {SEARCH_RADIUS_M / 1000:.0f} km of the study-area centre...")
    locations = discover_locations()
    if not locations:
        raise RuntimeError("OpenAQ returned no locations. Try a different study area or check API access.")

    sensor_jobs: list[dict[str, Any]] = []
    for location in locations:
        coords = location.get("coordinates") or {}
        lat, lon = coords.get("latitude"), coords.get("longitude")
        if lat is None or lon is None:
            continue
        for sensor in location.get("sensors") or []:
            parameter = sensor.get("parameter") or {}
            pollutant = normalize_pollutant(parameter.get("name") or parameter.get("displayName"))
            units = parameter.get("units")
            if pollutant and normalize_concentration(1.0, units) is not None:
                sensor_id = sensor.get("id")
                if sensor_id is not None:
                    sensor_jobs.append({
                        "location_id": location.get("id"),
                        "location_name": location.get("name") or location.get("locality") or f"Location {location.get('id')}",
                        "latitude": float(lat), "longitude": float(lon),
                        "sensor_id": int(sensor_id), "pollutant": pollutant,
                        "units": units,
                    })
    # Prevent duplicate calls for an accidental repeated sensor listing.
    unique_jobs = {job["sensor_id"]: job for job in sensor_jobs}
    jobs = list(unique_jobs.values())
    if not jobs:
        raise RuntimeError(
            "Found locations but no PM2.5/PM10 sensors with recognized concentration units. "
            "Try another area or inspect the returned OpenAQ sensor metadata."
        )
    print(f"Found {len(locations)} locations and {len(jobs)} PM sensor(s). Downloading hourly data...")

    observation_rows: list[dict[str, Any]] = []
    failed_sensors: list[int] = []
    for index, job in enumerate(jobs, start=1):
        try:
            measurements = fetch_sensor_hours(job["sensor_id"], start_date, end_date)
            count_before = len(observation_rows)
            for item in measurements:
                timestamp = extract_timestamp(item)
                concentration = normalize_concentration(item.get("value"), job["units"])
                if not timestamp or concentration is None:
                    continue
                observation_rows.append({
                    **job,
                    "timestamp_utc": pd.to_datetime(timestamp, utc=True).floor("h").isoformat(),
                    "value_ugm3": concentration,
                })
            print(f"  [{index}/{len(jobs)}] sensor {job['sensor_id']}: {len(observation_rows)-count_before} usable rows")
        except Exception as exc:  # continue so one bad sensor does not kill the run
            failed_sensors.append(job["sensor_id"])
            print(f"  WARNING: sensor {job['sensor_id']} skipped: {exc}")
        time.sleep(0.15)

    if not observation_rows:
        raise RuntimeError(
            "No usable measurement rows were downloaded. Check the date range and station coverage. "
            "OpenAQ sensors can have different historical availability."
        )

    observations = pd.DataFrame(observation_rows)
    observations["timestamp_utc"] = pd.to_datetime(observations["timestamp_utc"], utc=True).dt.floor("h")
    raw_file = DATA_DIR / "raw_observations.csv"
    observations.to_csv(raw_file, index=False)

    # Multiple PM sensors may exist at one site; aggregate them so a site does not get
    # overweighted merely because it has more sensors.
    station_hourly = (
        observations.groupby(
            ["location_id", "location_name", "latitude", "longitude", "timestamp_utc", "pollutant"],
            as_index=False,
        )
        .agg(value_ugm3=("value_ugm3", "median"), sensor_count=("sensor_id", "nunique"))
    )

    print("Fetching historical weather, elevation, and satellite AOD for each station...")
    weather_frames: list[pd.DataFrame] = []
    aod_frames: list[pd.DataFrame] = []
    elevation_map: dict = {}   # location_id -> elevation_m
    grouped_locations = station_hourly[["location_id", "latitude", "longitude"]].drop_duplicates("location_id")
    for index, site in enumerate(grouped_locations.itertuples(index=False), start=1):
        site_rows = station_hourly.loc[station_hourly["location_id"] == site.location_id, "timestamp_utc"]
        min_date = pd.to_datetime(site_rows.min(), utc=True).date()
        max_date = pd.to_datetime(site_rows.max(), utc=True).date()
        lat, lon = float(site.latitude), float(site.longitude)

        # Weather
        try:
            weather = fetch_weather_for_location(lat, lon, min_date, max_date)
            weather["location_id"] = site.location_id
            weather_frames.append(weather)
        except Exception as exc:
            print(f"  WARNING: weather fetch for location {site.location_id} failed: {exc}")

        # Satellite AOD (Copernicus/CAMS via Open-Meteo — free, no key)
        aod = fetch_aod_for_location(lat, lon, min_date, max_date)
        if not aod.empty:
            aod["location_id"] = site.location_id
            aod_frames.append(aod)

        # Elevation (Open-Meteo — free, no key)
        elev = fetch_elevation(lat, lon)
        elevation_map[site.location_id] = elev

        print(
            f"  [{index}/{len(grouped_locations)}] location {site.location_id}: "
            f"elev={elev:.0f}m  aod_rows={len(aod)}"
        )
        time.sleep(0.2)

    if not weather_frames:
        raise RuntimeError("Could not download weather for any location; check Open-Meteo connectivity and date ranges.")
    weather_all = pd.concat(weather_frames, ignore_index=True)
    weather_all["timestamp_utc"] = pd.to_datetime(weather_all["timestamp_utc"], utc=True).dt.floor("h")
    dataset = station_hourly.merge(weather_all, on=["location_id", "timestamp_utc"], how="left")

    # Join AOD
    if aod_frames:
        aod_all = pd.concat(aod_frames, ignore_index=True)
        aod_all["timestamp_utc"] = pd.to_datetime(aod_all["timestamp_utc"], utc=True).dt.floor("h")
        dataset = dataset.merge(aod_all, on=["location_id", "timestamp_utc"], how="left")
    else:
        dataset["aerosol_optical_depth"] = np.nan

    # Join elevation (scalar per location)
    dataset["elevation_m"] = dataset["location_id"].map(elevation_map)

    dataset = dataset.replace([np.inf, -np.inf], np.nan)
    dataset = dataset.dropna(subset=["value_ugm3", "latitude", "longitude"])

    output_file = DATA_DIR / "training_dataset.csv"
    dataset.to_csv(output_file, index=False)
    summary = dataset.groupby("pollutant").agg(rows=("value_ugm3", "size"), locations=("location_id", "nunique"))
    print("\nDownload and join complete.")
    print(f"Raw measurements: {raw_file}")
    print(f"Training dataset: {output_file}")
    print("\nDataset summary:")
    print(summary.to_string())
    aod_coverage = dataset["aerosol_optical_depth"].notna().mean() * 100
    elev_coverage = dataset["elevation_m"].notna().mean() * 100
    print(f"\nAOD coverage:       {aod_coverage:.1f}% of rows have satellite AOD data")
    print(f"Elevation coverage: {elev_coverage:.1f}% of rows have elevation data")
    if failed_sensors:
        print(f"\nNote: {len(failed_sensors)} sensors failed and were skipped.")
    print("\nCheck data coverage and licensing before making scientific claims.")


def main() -> None:
    today = date.today()
    parser = argparse.ArgumentParser(description="Download OpenAQ PM observations plus historical weather.")
    parser.add_argument("--start", default=(today - timedelta(days=180)).isoformat(), help="Start date YYYY-MM-DD (default: 180 days ago)")
    parser.add_argument("--end", default=(today - timedelta(days=7)).isoformat(), help="End date YYYY-MM-DD (default: 7 days ago)")
    args = parser.parse_args()
    run(date.fromisoformat(args.start), date.fromisoformat(args.end))


if __name__ == "__main__":
    main()
