"""Shared configuration for AeroGrid."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")

DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "models"
DATA_DIR.mkdir(exist_ok=True)
MODEL_DIR.mkdir(exist_ok=True)

OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY", "").strip()


@dataclass(frozen=True)
class City:
    """A study area with its own station dataset and trained model."""

    id: str
    name: str
    latitude: float
    longitude: float
    dataset_path: Path
    model_dir: Path
    # "measured" for sensor readings, "modelled" for model output such as CAMS.
    data_kind: str
    data_source: str
    # Suffix for per-city files written to data/ (held-out predictions, experiment reports).
    file_suffix: str = ""


# Delhi keeps the original file locations, so the AWS/SageMaker scripts work unchanged.
CITIES: dict[str, City] = {
    "delhi": City(
        "delhi", "Delhi", 28.6139, 77.2090,
        dataset_path=DATA_DIR / "training_dataset.csv",
        model_dir=MODEL_DIR,
        # Collected by data/ingest.py from Open-Meteo, which serves the CAMS atmospheric model.
        data_kind="modelled",
        data_source="CAMS model (Copernicus) via Open-Meteo",
    ),
    "bengaluru": City(
        "bengaluru", "Bengaluru", 12.9716, 77.5946,
        dataset_path=DATA_DIR / "bengaluru_openaq_2025.csv",
        model_dir=MODEL_DIR / "bengaluru",
        data_kind="measured",
        data_source="OpenAQ (CPCB / KSPCB sensors)",
        file_suffix="_bengaluru",
    ),
}
DEFAULT_CITY_ID = os.getenv("AEROGRID_CITY", "delhi").strip().lower()
if DEFAULT_CITY_ID not in CITIES:
    raise ValueError(f"AEROGRID_CITY must be one of {sorted(CITIES)}, not {DEFAULT_CITY_ID!r}.")


def get_city(city_id: str | None = None) -> City:
    """The city with this id, or the default city (AEROGRID_CITY) when None."""
    key = (city_id or DEFAULT_CITY_ID).strip().lower()
    if key not in CITIES:
        raise KeyError(f"Unknown city {city_id!r}. Available: {', '.join(sorted(CITIES))}.")
    return CITIES[key]


# Study-area centre used by fetch_data and as the default for the features (the default city's).
CENTER_LAT = float(os.getenv("CENTER_LAT", str(CITIES[DEFAULT_CITY_ID].latitude)))
CENTER_LON = float(os.getenv("CENTER_LON", str(CITIES[DEFAULT_CITY_ID].longitude)))
SEARCH_RADIUS_M = min(int(os.getenv("SEARCH_RADIUS_M", "25000")), 25000)

LOCAL_TIMEZONE = os.getenv("LOCAL_TIMEZONE", "Asia/Kolkata")

# AWS Configuration (Amazon S3 and Amazon SageMaker AI)
AWS_REGION = os.getenv("AWS_DEFAULT_REGION", os.getenv("AWS_REGION", "ap-south-1")).strip()
S3_BUCKET_NAME = os.getenv("S3_BUCKET_NAME", "").strip()
S3_PREFIX = os.getenv("S3_PREFIX", "aerogrid").strip()
SAGEMAKER_ROLE_ARN = os.getenv("SAGEMAKER_ROLE_ARN", "").strip()

OPENAQ_BASE_URL = "https://api.openaq.org/v3"
OPEN_METEO_ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"
OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
# Free satellite AOD + air quality (CAMS/Copernicus, no API key needed)
OPEN_METEO_AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
# Free elevation lookup (Open-Meteo, no API key needed)
OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation"

WEATHER_VARIABLES = [
    "temperature_2m",
    "relative_humidity_2m",
    "wind_speed_10m",
    "wind_direction_10m",
    "pressure_msl",
]

# Extra Indian cities to broaden spatial coverage beyond a single radius search.
# Each tuple: (name, lat, lon). fetch_data merges unique sensors across all centres.
# Cities are chosen because they host CPCB / state board stations reporting to OpenAQ.
EXTRA_STUDY_CENTRES = [
    # South India
    ("Chennai",          13.0827,  80.2707),
    ("Hyderabad",        17.3850,  78.4867),
    ("Visakhapatnam",    17.6868,  83.2185),
    ("Vijayawada",       16.5062,  80.6480),
    ("Coimbatore",       11.0168,  76.9558),
    ("Madurai",           9.9252,  78.1198),
    ("Kochi",            10.0159,  76.3419),
    ("Thiruvananthapuram", 8.5241, 76.9366),
    ("Mysuru",           12.2958,  76.6394),
    ("Mangaluru",        12.9141,  74.8560),
    ("Panaji",           15.4909,  73.8278),  # Goa

    # West India
    ("Mumbai",           19.0760,  72.8777),
    ("Pune",             18.5204,  73.8567),
    ("Nagpur",           21.1458,  79.0882),
    ("Aurangabad",       19.8762,  75.3433),
    ("Nashik",           19.9975,  73.7898),
    ("Surat",            21.1702,  72.8311),
    ("Ahmedabad",        23.0225,  72.5714),
    ("Vadodara",         22.3072,  73.1812),
    ("Rajkot",           22.3039,  70.8022),
    ("Bhopal",           23.2599,  77.4126),
    ("Indore",           22.7196,  75.8577),
    ("Jabalpur",         23.1815,  79.9864),

    # North India
    ("Delhi",            28.6139,  77.2090),
    ("Gurugram",         28.4595,  77.0266),
    ("Faridabad",        28.4089,  77.3178),
    ("Noida",            28.5355,  77.3910),
    ("Ghaziabad",        28.6692,  77.4538),
    ("Agra",             27.1767,  78.0081),
    ("Lucknow",          26.8467,  80.9462),
    ("Kanpur",           26.4499,  80.3319),
    ("Varanasi",         25.3176,  82.9739),
    ("Prayagraj",        25.4358,  81.8463),
    ("Patna",            25.5941,  85.1376),
    ("Jaipur",           26.9124,  75.7873),
    ("Jodhpur",          26.2389,  73.0243),
    ("Udaipur",          24.5854,  73.7125),
    ("Chandigarh",       30.7333,  76.7794),
    ("Ludhiana",         30.9010,  75.8573),
    ("Amritsar",         31.6340,  74.8723),
    ("Dehradun",         30.3165,  78.0322),

    # East India
    ("Kolkata",          22.5726,  88.3639),
    ("Bhubaneswar",      20.2961,  85.8245),
    ("Guwahati",         26.1445,  91.7362),
    ("Ranchi",           23.3441,  85.3096),
    ("Raipur",           21.2514,  81.6296),
    ("Dhanbad",          23.7957,  86.4304),
]

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
