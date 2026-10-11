import json
import math
import time
from pathlib import Path
from typing import Dict, Any
import requests

from backend.app.config import DATA_DIR

GEO_CACHE_FILE = Path(DATA_DIR) / "geo_cache.json"


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000.0  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2.0) ** 2
    return 2.0 * R * math.asin(math.sqrt(max(0.0, min(1.0, a))))


def fetch_overpass_features(lat: float, lon: float, radius_m: int = 1000) -> Dict[str, float]:
    """Fetch road network data from OSM and calculate density and distance to major roads."""
    url = "https://overpass-api.de/api/interpreter"
    query = f'[out:json];way["highway"~"motorway|trunk|primary"](around:{radius_m},{lat},{lon});out geom;'
    headers = {"User-Agent": "AeroGrid-Research/1.0", "Content-Type": "application/x-www-form-urlencoded"}

    data = {}
    try:
        resp = requests.post(url, data=query.encode("utf-8"), headers=headers, timeout=2.5)
        if resp.status_code == 200:
            data = resp.json()
        else:
            return {"road_density_2km": 0.0, "dist_to_major_road_m": float(radius_m)}
    except Exception:
        # Instant graceful fallback when network is unavailable or offline
        return {"road_density_2km": 0.0, "dist_to_major_road_m": float(radius_m)}

    total_length = 0.0
    min_distance = float(radius_m)

    for element in data.get("elements", []):
        if element.get("type") == "way":
            geom = element.get("geometry", [])
            way_length = 0.0
            for i in range(len(geom)):
                pt_lat, pt_lon = geom[i]["lat"], geom[i]["lon"]
                dist_to_target = haversine(lat, lon, pt_lat, pt_lon)
                if dist_to_target < min_distance:
                    min_distance = dist_to_target
                if i > 0:
                    prev_lat, prev_lon = geom[i - 1]["lat"], geom[i - 1]["lon"]
                    way_length += haversine(prev_lat, prev_lon, pt_lat, pt_lon)
            total_length += way_length

    return {
        "road_density_2km": round(total_length, 2),
        "dist_to_major_road_m": round(min_distance, 2),
    }


def get_geo_features(lat: float, lon: float) -> Dict[str, float]:
    """Get geographic features for a coordinate, utilizing a local cache file."""
    cache = {}
    if GEO_CACHE_FILE.exists():
        try:
            with open(GEO_CACHE_FILE, "r") as f:
                cache = json.load(f)
        except Exception:
            cache = {}

    key = f"{round(float(lat), 4)},{round(float(lon), 4)}"

    if key not in cache:
        features = fetch_overpass_features(lat, lon)
        cache[key] = features
        try:
            GEO_CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(GEO_CACHE_FILE, "w") as f:
                json.dump(cache, f, indent=2)
        except Exception:
            pass

    return cache[key]
