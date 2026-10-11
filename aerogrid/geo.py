import json
import math
import time
from pathlib import Path
import requests

from aerogrid.config import DATA_DIR

GEO_CACHE_FILE = DATA_DIR / "geo_cache.json"


def haversine(lat1, lon1, lat2, lon2):
    """Calculate distance in meters between two lat/lon points."""
    R = 6371000  # meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
    return 2 * R * math.asin(math.sqrt(a))


# Public Overpass endpoints, tried in order. Failures are reported as unknown (NaN), never as
# "no roads", so a network error can't masquerade as a real feature value.
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]


def fetch_overpass_features(lat, lon, radius_m=1000):
    """Fetch road network data from OSM and calculate density and distance to major roads.

    Returns None if every endpoint fails, so callers can treat the features as missing.
    """
    # Query for major roads within a smaller radius to prevent 504 timeouts
    query = f'[out:json];way["highway"~"motorway|trunk|primary"](around:{radius_m},{lat},{lon});out geom;'

    # Send as raw bytes to avoid improper Content-Type urlencoding which triggers 406
    headers = {"User-Agent": "AeroGrid-Research/1.0", "Content-Type": "application/x-www-form-urlencoded"}

    data = None
    for url in OVERPASS_URLS:
        for attempt in range(3):
            try:
                resp = requests.post(url, data=query.encode('utf-8'), headers=headers, timeout=(10, 40))
                if resp.status_code in (429, 504):
                    time.sleep(5 * (attempt + 1))
                    continue
                resp.raise_for_status()
                data = resp.json()
                break
            except Exception as e:
                time.sleep(2)
        if data is not None:
            break
    if data is None:
        print(f"Failed to fetch geo features for {lat}, {lon}; treating them as unknown.")
        return None

    total_length = 0.0
    min_distance = float(radius_m)

    for element in data.get("elements", []):
        if element.get("type") == "way":
            geom = element.get("geometry", [])
            way_length = 0.0
            for i in range(len(geom)):
                pt_lat, pt_lon = geom[i]["lat"], geom[i]["lon"]
                
                # Check distance from our target coordinate to this road point
                dist_to_target = haversine(lat, lon, pt_lat, pt_lon)
                if dist_to_target < min_distance:
                    min_distance = dist_to_target

                # Calculate length of the road segment
                if i > 0:
                    prev_lat, prev_lon = geom[i-1]["lat"], geom[i-1]["lon"]
                    way_length += haversine(prev_lat, prev_lon, pt_lat, pt_lon)

            total_length += way_length

    return {
        "road_density_2km": round(total_length, 2),
        "dist_to_major_road_m": round(min_distance, 2)
    }


def get_geo_features(lat, lon):
    """Get geographic features for a coordinate, utilizing a local cache file."""
    cache = {}
    if GEO_CACHE_FILE.exists():
        try:
            with open(GEO_CACHE_FILE, "r") as f:
                cache = json.load(f)
        except json.JSONDecodeError:
            pass

    # Round to 4 decimal places for cache key (groups coordinates within ~11 meters)
    key = f"{round(float(lat), 4)},{round(float(lon), 4)}"

    if key not in cache:
        print(f"Fetching OpenStreetMap data for location {key}...")
        features = fetch_overpass_features(lat, lon)
        # Be polite to the Overpass API by pacing requests
        time.sleep(1)
        if features is None:
            # Not cached, so a later call can retry; NaN lets the model's imputer handle it.
            return {"road_density_2km": float("nan"), "dist_to_major_road_m": float("nan")}
        cache[key] = features
        with open(GEO_CACHE_FILE, "w") as f:
            json.dump(cache, f, indent=2)

    return cache[key]
