"""REST API Backend for AeroGrid.

Provides standard HTTP JSON endpoints for external frontend applications
(React, Vue, Next.js, mobile apps, or custom dashboards).

Endpoints used by the AeroGrid web frontend (see docs/api-contract.md). Each takes an optional
`city` (see GET /api/cities); without it the default city (AEROGRID_CITY, Delhi) is used.
- GET /api/cities
- GET /api/health
- GET /api/stations
- GET /api/predict?lat=&lon=
- GET /api/metrics

Earlier endpoints are kept unchanged for other clients:
- POST /api/predict  (original response shape)
- GET  /api/metrics/{pollutant}
"""
from __future__ import annotations

import json
import math
from datetime import datetime, timezone
from typing import Any, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aerogrid.config import CITIES, DATA_DIR, SEARCH_RADIUS_M, City, get_city
from aerogrid.features import drop_future_rows

app = FastAPI(
    title="AeroGrid Air Quality Prediction API",
    description="Backend API serving ML-based PM2.5 predictions for frontend clients.",
    version="1.0.0",
)

# Enable CORS so frontend applications (running on localhost:3000, 5173, etc.) can query without restrictions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

POLLUTANT_LABELS = {"pm25": "PM2.5"}

# The model only saw stations within SEARCH_RADIUS_M of the study-area centre. Estimates further
# away than this (search radius plus a margin) are refused instead of returning meaningless values.
MAX_DISTANCE_FROM_CENTRE_KM = SEARCH_RADIUS_M / 1000 + 15


class PredictionRequest(BaseModel):
    pollutant: str = Field("pm25", description="Target pollutant: 'pm25' (the only supported pollutant)")
    latitude: float = Field(..., description="Target latitude (e.g. 12.9716)")
    longitude: float = Field(..., description="Target longitude (e.g. 77.5946)")
    timestamp: Optional[str] = Field(
        None, description="ISO format datetime (e.g. '2025-06-15T12:00:00'). Defaults to current time."
    )
    city: Optional[str] = Field(None, description="City id from GET /api/cities (default: the default city)")


def _city(city_id: Optional[str]) -> City:
    try:
        return get_city(city_id)
    except KeyError:
        raise HTTPException(status_code=404, detail=f"Unknown city '{city_id}'. Available: {', '.join(sorted(CITIES))}.")


def _normalize_pollutant(value: str) -> str:
    compact = "".join(ch for ch in value.lower() if ch.isalnum())
    if compact in {"pm25", "pm2"}:
        return "pm25"
    if compact == "pm10":
        raise HTTPException(status_code=404, detail="PM10 has been removed: under station-held-out validation it was no better than predicting the typical value.")
    raise HTTPException(status_code=422, detail="Unsupported pollutant. Use 'pm25'.")


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    a = math.sin(math.radians(lat2 - lat1) / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 2 * 6371.0088 * math.asin(math.sqrt(min(1.0, a)))


def _check_study_area(city: City, latitude: float, longitude: float) -> None:
    if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
        raise HTTPException(status_code=422, detail="Latitude must be -90…90 and longitude -180…180.")
    distance = _haversine_km(city.latitude, city.longitude, latitude, longitude)
    if distance > MAX_DISTANCE_FROM_CENTRE_KM:
        raise HTTPException(
            status_code=422,
            detail=(
                f"The {city.name} model was trained on stations within {SEARCH_RADIUS_M / 1000:.0f} km of "
                f"({city.latitude:.4f}, {city.longitude:.4f}). This point is {distance:.0f} km away, "
                "so no estimate is returned."
            ),
        )


def _parse_timestamp(value: Optional[str]) -> datetime:
    if not value:
        return datetime.now()
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid timestamp format: '{value}'. Use ISO format (e.g. '2025-06-15T12:00:00').",
        )


def _run_prediction(pollutant: str, city: City, latitude: float, longitude: float, target_dt: datetime) -> dict[str, Any]:
    # Imported lazily so /api/health, /api/stations and /api/metrics keep working even when
    # the prediction dependencies (features, fetch_data) are unavailable.
    try:
        from aerogrid.predict import predict_location
    except ModuleNotFoundError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"The prediction pipeline is not installed on the server yet ({exc.name} is missing), so no estimate can be made.",
        )

    return predict_location(
        pollutant=pollutant,
        latitude=latitude,
        longitude=longitude,
        local_datetime=target_dt,
        city=city,
    )


def _finite(value: Any) -> Any:
    """JSON cannot carry NaN/Infinity; report them as null (unavailable)."""
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def _read_validation(pollutant: str, city: City) -> dict[str, Any] | None:
    path = city.model_dir / f"{pollutant}_validation.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _calibrated_interval(pollutant: str, city: City, value: float | None) -> dict[str, Any] | None:
    """90% interval from held-out station errors (see experiments.interval_calibration)."""
    if value is None:
        return None
    v = _read_validation(pollutant, city)
    cal = (v or {}).get("interval_90")
    if not cal:
        return None
    return {
        "lower": round(max(0.0, value * cal["low_ratio"]), 1),
        "upper": round(value * cal["high_ratio"], 1),
        "confidence_level": cal["level"],
    }


def _read_metrics(pollutant: str, city: City) -> dict[str, Any] | None:
    path = city.model_dir / f"{pollutant}_metrics.json"
    if not path.exists():
        return None
    return {k: _finite(v) for k, v in json.loads(path.read_text(encoding="utf-8")).items()}


@app.get("/")
def root():
    """Health check and API information."""
    return {
        "service": "AeroGrid Backend API",
        "status": "online",
        "docs_url": "/docs",
        "supported_pollutants": ["pm25"],
        "cities": sorted(CITIES),
    }


def _predictor_available() -> bool:
    try:
        import aerogrid.predict  # noqa: F401
    except Exception:
        return False
    return True


def _city_status(city: City, predictor_available: bool) -> dict[str, Any]:
    model_available = (city.model_dir / "pm25_model.joblib").exists()
    return {
        "model_available": model_available,
        "station_data_available": city.dataset_path.exists(),
        "prediction_available": predictor_available and model_available,
    }


@app.get("/api/cities")
def cities():
    """Study areas the backend can serve, each with its own station data and model."""
    predictor = _predictor_available()
    return {
        "cities": [
            {
                "id": c.id,
                "name": c.name,
                "latitude": c.latitude,
                "longitude": c.longitude,
                "data_kind": c.data_kind,
                "data_source": c.data_source,
                **_city_status(c, predictor),
            }
            for c in CITIES.values()
        ]
    }


@app.get("/api/health")
def health(city: Optional[str] = Query(None, description="City id (default: the default city)")):
    """Service status for the frontend: 'ok' only when stations, model and predictor are all usable."""
    status = _city_status(_city(city), _predictor_available())
    ok = status["station_data_available"] and status["prediction_available"]
    return {"status": "ok" if ok else "degraded", **status}


def _load_city_frame(city: City, pollutant: str) -> pd.DataFrame:
    """Station rows for one city and pollutant, without forecasts or unparseable rows, oldest first."""
    frame = pd.read_csv(
        city.dataset_path,
        usecols=lambda c: c in {"location_id", "location_name", "latitude", "longitude", "timestamp_utc", "pollutant", "value_ugm3"},
    )
    frame = frame.loc[frame["pollutant"].astype(str).str.lower() == pollutant].copy()
    frame = drop_future_rows(frame)
    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    frame["value_ugm3"] = pd.to_numeric(frame["value_ugm3"], errors="coerce")
    frame = frame.dropna(subset=["location_id", "latitude", "longitude", "timestamp_utc"])
    return frame.sort_values("timestamp_utc")


_station_cache: dict[tuple, dict[str, Any]] = {}
_latest_time_cache: dict[tuple, Optional[pd.Timestamp]] = {}


def _latest_data_time(city: City, pollutant: str) -> Optional[pd.Timestamp]:
    """Most recent observation hour in a city's dataset (forecasts excluded)."""
    if not city.dataset_path.exists():
        return None
    key = (city.id, pollutant, city.dataset_path.stat().st_mtime, pd.Timestamp.now(tz="UTC").floor("h"))
    if key not in _latest_time_cache:
        frame = _load_city_frame(city, pollutant).dropna(subset=["value_ugm3"])
        _latest_time_cache.clear()
        _latest_time_cache[key] = None if frame.empty else frame["timestamp_utc"].max().floor("h")
    return _latest_time_cache[key]


@app.get("/api/stations")
def stations(
    pollutant: str = Query("pm25", description="Pollutant: pm25"),
    history_days: int = Query(30, ge=0, le=90, description="Days of history per station (0 for none)"),
    city: Optional[str] = Query(None, description="City id (default: the default city)"),
):
    """Latest value per monitoring station, with recent history.

    `source_type` says whether values are sensor measurements or modelled values (the city's
    data_kind); forecast rows dated after now are excluded. Nothing is interpolated or filled in.
    """
    p = _normalize_pollutant(pollutant)
    c = _city(city)
    if not c.dataset_path.exists():
        raise HTTPException(
            status_code=503,
            detail=f"Station data for {c.name} is not available on the server ({c.dataset_path.name} not found).",
        )
    # The hour is part of the key because forecast rows become usable observations as time passes.
    cache_key = (c.id, p, history_days, pd.Timestamp.now(tz="UTC").floor("h"), c.dataset_path.stat().st_mtime)
    if cache_key in _station_cache:
        return _station_cache[cache_key]

    frame = _load_city_frame(c, p)
    result = []
    for location_id, rows in frame.groupby("location_id", sort=False):
        valid = rows.dropna(subset=["value_ugm3"])
        latest = valid.iloc[-1] if not valid.empty else None
        history = []
        if history_days and latest is not None:
            window = rows.loc[rows["timestamp_utc"] >= latest["timestamp_utc"] - pd.Timedelta(days=history_days)]
            history = [
                {"timestamp": ts.isoformat(), "value": None if pd.isna(v) else round(float(v), 1)}
                for ts, v in zip(window["timestamp_utc"], window["value_ugm3"])
            ]
        meta = rows.iloc[-1]
        result.append({
            "id": str(location_id),
            "name": None if pd.isna(meta.get("location_name")) else str(meta["location_name"]),
            "latitude": float(meta["latitude"]),
            "longitude": float(meta["longitude"]),
            "pollutant": POLLUTANT_LABELS[p],
            "value": None if latest is None else round(float(latest["value_ugm3"]), 1),
            "unit": "µg/m³",
            "source_type": c.data_kind,
            "timestamp": None if latest is None else latest["timestamp_utc"].isoformat(),
            "data_source": c.data_source,
            "history": history,
        })

    payload = {"stations": result}
    # Keep one entry per city so switching cities does not re-read the CSV.
    for key in [k for k in _station_cache if k[0] == c.id]:
        del _station_cache[key]
    _station_cache[cache_key] = payload
    return payload


@app.get("/api/metrics")
def metrics_for_frontend(
    pollutant: str = Query("pm25", description="Pollutant: pm25"),
    city: Optional[str] = Query(None, description="City id (default: the default city)"),
):
    """Validation metrics in the frontend contract shape. Only measured results are reported."""
    p = _normalize_pollutant(pollutant)
    c = _city(city)
    m = _read_metrics(p, c)
    trained = m.get("created_at_utc") if m else None
    model_version = f"{p}-hgb-{trained[:10]}" if trained else None

    # Prefer station-held-out cross-validation (every station tested once; see aerogrid/experiments.py)
    # over the single train/test split recorded at training time.
    v = _read_validation(p, c)
    if v is not None:
        vm = {k: _finite(val) for k, val in v["metrics"].items()}
        start, end = v.get("data_start_utc"), v.get("data_end_utc")
        return {
            "model_name": "AeroGrid model (gradient boosting)",
            "model_version": model_version,
            "evaluation_method": f"{v['evaluation_type']}; {v['n_locations']} stations",
            "sample_count": v.get("n_rows"),
            "mae": vm.get("mae_ugm3"),
            "rmse": vm.get("rmse_ugm3"),
            "bias": vm.get("bias_ugm3"),
            "r2": vm.get("r2"),
            "evaluated_at": v.get("created_at_utc"),
            "training_period": f"{start[:10]} – {end[:10]}" if start and end else None,
            "baselines": [
                {"method": b["method"], "mae": _finite(b.get("mae_ugm3")), "rmse": _finite(b.get("rmse_ugm3")), "bias": _finite(b.get("bias_ugm3"))}
                for b in v.get("baselines") or []
            ],
            "held_out_predictions": v.get("held_out_predictions"),
        }

    if m is None:
        raise HTTPException(status_code=404, detail=f"Metrics for {p} in {c.name} not found.")

    held_out = None
    holdout_path = DATA_DIR / f"holdout_predictions_{p}{c.file_suffix}.csv"
    if holdout_path.exists():
        rows = pd.read_csv(holdout_path)
        rows = rows.dropna(subset=["value_ugm3", "predicted_ugm3"])
        if len(rows) > 500:
            rows = rows.sample(500, random_state=42)
        held_out = [
            {
                "station_id": str(r.location_id),
                "station_name": None if pd.isna(r.location_name) else str(r.location_name),
                "actual": round(float(r.value_ugm3), 1),
                "predicted": round(float(r.predicted_ugm3), 1),
            }
            for r in rows.itertuples(index=False)
        ]

    start, end = m.get("data_start_utc"), m.get("data_end_utc")
    return {
        "model_name": "AeroGrid model (gradient boosting)",
        "model_version": model_version,
        "evaluation_method": m.get("evaluation_type"),
        "sample_count": m.get("n_test"),
        "mae": m.get("mae_ugm3"),
        "rmse": m.get("rmse_ugm3"),
        "bias": m.get("bias_ugm3"),
        "r2": m.get("r2"),
        "evaluated_at": trained,
        "training_period": f"{start[:10]} – {end[:10]}" if start and end else None,
        "baselines": [
            {"method": b.get("method"), "mae": _finite(b.get("mae_ugm3")), "rmse": _finite(b.get("rmse_ugm3")), "bias": _finite(b.get("bias_ugm3"))}
            for b in m.get("baselines") or []
        ]
        or [{"method": "Training median (constant)", "mae": m.get("training_median_baseline_mae_ugm3"), "rmse": None, "bias": None}],
        "held_out_predictions": held_out,
    }


@app.get("/api/metrics/{pollutant}")
def get_model_metrics(pollutant: str, city: Optional[str] = Query(None, description="City id")):
    """Return model accuracy and validation metrics for the specified pollutant."""
    p = _normalize_pollutant(pollutant)
    data = _read_metrics(p, _city(city))
    if data is None:
        raise HTTPException(status_code=404, detail=f"Metrics for {pollutant} not found.")
    return {"pollutant": p, "metrics": data}


@app.post("/api/predict")
def predict_pollution(req: PredictionRequest):
    """Estimate pollutant concentration at an unmonitored location."""
    p = _normalize_pollutant(req.pollutant)
    c = _city(req.city)
    _check_study_area(c, req.latitude, req.longitude)
    target_dt = _parse_timestamp(req.timestamp)

    try:
        result = _run_prediction(p, c, req.latitude, req.longitude, target_dt)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")
    return {
        "status": "success",
        "pollutant": p,
        "city": c.id,
        "prediction_ugm3": result.get("ml_prediction_ugm3"),
        "unit": "µg/m³",
        "target": {
            "latitude": req.latitude,
            "longitude": req.longitude,
            "timestamp": target_dt.isoformat(),
        },
        "nearest_station_distance_km": result.get("nearest_station_distance_km_used_by_model"),
        "road_density_2km": result.get("road_density_2km"),
        "dist_to_major_road_m": result.get("dist_to_major_road_m"),
        "idw_comparison": result.get("idw_comparison"),
        "model_metrics": result.get("metrics"),
    }


@app.get("/api/predict")
def predict_for_frontend(
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
    latitude: Optional[float] = Query(None, description="Alias of lat"),
    longitude: Optional[float] = Query(None, description="Alias of lon"),
    pollutant: str = Query("pm25", description="Pollutant: pm25"),
    timestamp: Optional[str] = Query(None, description="ISO timestamp (optional, defaults to the city's latest data hour)"),
    city: Optional[str] = Query(None, description="City id (default: the default city)"),
):
    """Model estimate in the frontend contract shape. It is an estimate, never a measurement.

    Without a timestamp the estimate is for the latest hour with station data, so it can be
    compared with the station values on the map and uses real neighbour readings. For a city
    whose dataset is historical (e.g. Bengaluru, 2025) that hour is in the past;
    `observation_timestamp` reports it.
    """
    lat_value = lat if lat is not None else latitude
    lon_value = lon if lon is not None else longitude
    if lat_value is None or lon_value is None:
        raise HTTPException(status_code=422, detail="Provide lat and lon query parameters.")
    p = _normalize_pollutant(pollutant)
    c = _city(city)
    _check_study_area(c, lat_value, lon_value)
    if timestamp:
        target_dt = _parse_timestamp(timestamp)
    else:
        latest = _latest_data_time(c, p)
        now = pd.Timestamp.now(tz="UTC").floor("h")
        target_dt = (latest if latest is not None and latest < now else now).to_pydatetime()

    try:
        result = _run_prediction(p, c, lat_value, lon_value, target_dt)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")

    value = result.get("ml_prediction_ugm3")
    trained = result.get("trained_at_utc")
    return {
        "location": {"name": None, "latitude": lat_value, "longitude": lon_value},
        "pollutant": POLLUTANT_LABELS[p],
        "value": None if value is None else round(float(value), 1),
        "unit": "µg/m³",
        "source_type": "estimated",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        # Empirical interval calibrated on held-out stations; omitted if no calibration is published.
        "uncertainty": _calibrated_interval(p, c, None if value is None else float(value)),
        "model_version": f"{p}-hgb-{trained[:10]}" if trained else None,
        # The hour of station data (neighbour readings and weather) the estimate is for.
        "observation_timestamp": result.get("timestamp_utc"),
    }
