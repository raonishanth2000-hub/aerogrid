"""AeroGrid Data Fetching and Normalization Module.

Provides:
- OpenAQ v3 atmospheric ingestion and multi-format payload parsing
- Unit normalization (µg/m³, mg/m³)
- Open-Meteo elevation and Copernicus CAMS satellite AOD retrieval
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, Optional
import numpy as np
import pandas as pd
import requests


def normalize_pollutant(value: str) -> str:
    """Normalize pollutant identifier to canonical 'pm25' or 'pm10'."""
    compact = "".join(ch for ch in str(value).lower() if ch.isalnum())
    if compact in {"pm25", "pm2"}:
        return "pm25"
    if compact == "pm10":
        return "pm10"
    raise ValueError(f"Unsupported pollutant '{value}'. Must be 'pm25' or 'pm10'.")


def normalize_concentration(value: Any, unit: str) -> Optional[float]:
    """Normalize concentration value to µg/m³. Returns None for unsupported units."""
    if value is None:
        return None
    try:
        val = float(value)
    except (ValueError, TypeError):
        return None

    clean_unit = str(unit or "").strip().lower()
    if clean_unit in {"µg/m³", "ug/m3", "µg/m3", "ug/m³"}:
        return val
    if clean_unit in {"mg/m³", "mg/m3"}:
        return val * 1000.0
    return None


def extract_timestamp(item: Dict[str, Any]) -> Optional[str]:
    """Robustly extract UTC timestamp string from varying OpenAQ v3 JSON shapes."""
    if not isinstance(item, dict):
        return None

    # Shape B: nested inside period dict
    period = item.get("period")
    if isinstance(period, dict):
        dt_from = period.get("datetimeFrom")
        if isinstance(dt_from, dict):
            if "utc" in dt_from and dt_from["utc"]:
                return str(dt_from["utc"])
            if "local" in dt_from and dt_from["local"]:
                return str(dt_from["local"])

    # Shape A: top-level datetimeFrom
    dt_from = item.get("datetimeFrom")
    if isinstance(dt_from, dict):
        if "utc" in dt_from and dt_from["utc"]:
            return str(dt_from["utc"])
        if "local" in dt_from and dt_from["local"]:
            return str(dt_from["local"])

    # Shape C: top-level datetime
    dt = item.get("datetime")
    if isinstance(dt, dict):
        if "utc" in dt and dt["utc"]:
            return str(dt["utc"])
        if "local" in dt and dt["local"]:
            return str(dt["local"])

    # Fallback to direct string timestamp if present
    for key in ("timestamp", "timestamp_utc", "date"):
        val = item.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()

    return None


def fetch_elevation(latitude: float, longitude: float) -> Optional[float]:
    """Fetch elevation in meters from Open-Meteo elevation API (free, no API key)."""
    url = "https://api.open-meteo.com/v1/elevation"
    try:
        resp = requests.get(
            url,
            params={"latitude": latitude, "longitude": longitude},
            timeout=8,
            headers={"User-Agent": "AeroGrid-Research/1.0"},
        )
        resp.raise_for_status()
        elevations = resp.json().get("elevation") or []
        if elevations:
            return float(elevations[0])
    except Exception:
        pass
    return None


def fetch_aod_for_location(
    latitude: float,
    longitude: float,
    start_date: Any,
    end_date: Any,
) -> pd.DataFrame:
    """Fetch Copernicus CAMS Aerosol Optical Depth (AOD) via Open-Meteo Air Quality API."""
    url = "https://air-quality-api.open-meteo.com/v1/air-quality"
    start_str = start_date.isoformat() if hasattr(start_date, "isoformat") else str(start_date)
    end_str = end_date.isoformat() if hasattr(end_date, "isoformat") else str(end_date)

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "start_date": start_str,
        "end_date": end_str,
        "hourly": "aerosol_optical_depth",
        "timezone": "GMT",
    }
    try:
        resp = requests.get(url, params=params, timeout=12, headers={"User-Agent": "AeroGrid-Research/1.0"})
        resp.raise_for_status()
        hourly = resp.json().get("hourly") or {}
        times = hourly.get("time") or []
        aod_vals = hourly.get("aerosol_optical_depth") or []
        if times and aod_vals:
            df = pd.DataFrame({
                "timestamp_utc": pd.to_datetime(times, utc=True),
                "aerosol_optical_depth": [float(v) if v is not None else np.nan for v in aod_vals],
            })
            return df
    except Exception:
        pass

    return pd.DataFrame(columns=["timestamp_utc", "aerosol_optical_depth"])
