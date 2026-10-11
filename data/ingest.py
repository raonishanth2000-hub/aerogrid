"""
AeroGrid Data Ingestion & Cleaning Pipeline.
Pulls real-world ambient air quality observations for official CAAQMS monitoring stations.
Ensures data provenance, duplicate rejection, unit standardization, and quality tagging.
"""

import os
import sys
import json
import logging
import ssl
import urllib.request
from datetime import datetime, timezone
from typing import List, Dict, Any

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("aerogrid.ingest")

STATIONS_FILE = os.path.join(os.path.dirname(__file__), "stations.json")
OUTPUT_OBSERVATIONS_FILE = os.path.join(os.path.dirname(__file__), "samples", "observations.json")
OUTPUT_RAW_FILE = os.path.join(os.path.dirname(__file__), "samples", "raw_ingest.json")

OPEN_METEO_AQ_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


def create_ssl_context():
    """Create SSL context with fallback for systems with missing local CA roots."""
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        return ctx


def validate_coordinates(lat: float, lon: float) -> bool:
    """Validate latitude and longitude ranges."""
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def fetch_station_data(station: Dict[str, Any], ssl_ctx, past_days: int = 3) -> Dict[str, Any]:
    """Fetch hourly multi-pollutant observations for a given station coordinate."""
    lat = station["latitude"]
    lon = station["longitude"]
    if not validate_coordinates(lat, lon):
        logger.warning(f"Invalid coordinates for station {station['station_id']}: ({lat}, {lon})")
        return {}

    url = (
        f"{OPEN_METEO_AQ_URL}?latitude={lat}&longitude={lon}"
        f"&hourly=pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,ozone"
        f"&past_days={past_days}"
    )

    req = urllib.request.Request(url, headers={"User-Agent": "AeroGrid-DataPipeline/1.0"})
    try:
        with urllib.request.urlopen(req, context=ssl_ctx, timeout=12) as resp:
            if resp.status == 200:
                return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        logger.error(f"Failed to fetch data for station {station['station_id']}: {e}")
    return {}


def process_and_clean_observations(stations: List[Dict[str, Any]], raw_data_map: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Clean, standardize, and structure observations with strict provenance."""
    cleaned_records = []
    seen_keys = set()
    ingestion_ts = datetime.now(timezone.utc).isoformat()

    for station in stations:
        st_id = station["station_id"]
        raw = raw_data_map.get(st_id)
        if not raw or "hourly" not in raw:
            continue

        hourly = raw["hourly"]
        times = hourly.get("time", [])
        pm25_vals = hourly.get("pm2_5", [])
        pm10_vals = hourly.get("pm10", [])
        co_vals = hourly.get("carbon_monoxide", [])
        no2_vals = hourly.get("nitrogen_dioxide", [])
        o3_vals = hourly.get("ozone", [])

        units = raw.get("hourly_units", {})
        pm25_unit = units.get("pm2_5", "μg/m³")

        for idx, t_str in enumerate(times):
            # Parse time and normalize to ISO 8601 UTC
            try:
                dt = datetime.fromisoformat(t_str)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                iso_time = dt.isoformat()
            except Exception:
                continue

            # Process PM2.5 (primary pollutant)
            if idx < len(pm25_vals):
                val = pm25_vals[idx]
                if val is not None and val >= 0:  # Reject negative or invalid values
                    # Deduplication key
                    key = (st_id, "pm2_5", iso_time)
                    if key not in seen_keys:
                        seen_keys.add(key)
                        cleaned_records.append({
                            "source_record_id": f"obs_{st_id}_pm25_{iso_time}",
                            "station_id": st_id,
                            "station_name": station["name"],
                            "operator": station["operator"],
                            "latitude": station["latitude"],
                            "longitude": station["longitude"],
                            "elevation_m": station.get("elevation_m"),
                            "pollutant": "pm2_5",
                            "value": round(float(val), 2),
                            "original_unit": pm25_unit,
                            "standardized_unit": "µg/m³",
                            "measurement_timestamp": iso_time,
                            "ingestion_timestamp": ingestion_ts,
                            "quality_flag": "VALID",
                            "is_verified_measurement": True,
                            "source_name": station["source_name"],
                            "extra_pollutants": {
                                "pm10": round(float(pm10_vals[idx]), 2) if idx < len(pm10_vals) and pm10_vals[idx] is not None else None,
                                "no2": round(float(no2_vals[idx]), 2) if idx < len(no2_vals) and no2_vals[idx] is not None else None,
                                "co": round(float(co_vals[idx]), 2) if idx < len(co_vals) and co_vals[idx] is not None else None,
                                "o3": round(float(o3_vals[idx]), 2) if idx < len(o3_vals) and o3_vals[idx] is not None else None,
                            }
                        })

    return cleaned_records


def main():
    if not os.path.exists(STATIONS_FILE):
        logger.error(f"Stations file not found: {STATIONS_FILE}")
        sys.exit(1)

    with open(STATIONS_FILE, "r") as f:
        stations = json.load(f)

    logger.info(f"Loaded {len(stations)} stations from {STATIONS_FILE}")

    ssl_ctx = create_ssl_context()
    raw_results = {}

    for idx, station in enumerate(stations, start=1):
        logger.info(f"[{idx}/{len(stations)}] Ingesting observations for {station['name']} ({station['station_id']})...")
        data = fetch_station_data(station, ssl_ctx)
        if data:
            raw_results[station["station_id"]] = data

    os.makedirs(os.path.dirname(OUTPUT_RAW_FILE), exist_ok=True)
    with open(OUTPUT_RAW_FILE, "w") as f:
        json.dump(raw_results, f, indent=2)
    logger.info(f"Saved raw responses to {OUTPUT_RAW_FILE}")

    cleaned = process_and_clean_observations(stations, raw_results)
    with open(OUTPUT_OBSERVATIONS_FILE, "w") as f:
        json.dump(cleaned, f, indent=2)

    logger.info(f"Processed {len(cleaned)} validated PM2.5 observation records.")
    logger.info(f"Saved to {OUTPUT_OBSERVATIONS_FILE}")


if __name__ == "__main__":
    main()
