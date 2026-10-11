"""AeroGrid ML Training Pipeline.

Trains spatial regressors (HistGradientBoosting / Random Forest) for PM2.5 or PM10
across unmonitored coordinates using meteorology, geographic features, satellite AOD,
and spatial neighbor context with defensible station-level holdout validation.
"""
from __future__ import annotations

import argparse
import json
import logging
import math
import os
import sys
import warnings
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline

from ml.features import FEATURE_COLUMNS, haversine_km, make_model_features
from ml.fetch_data import normalize_pollutant

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("aerogrid.ml.train")

DATA_DIR = Path(__file__).resolve().parents[1] / "data"
ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"
OBSERVATIONS_FILE = DATA_DIR / "samples" / "observations.json"

LOCAL_TIMEZONE = os.getenv("LOCAL_TIMEZONE", "Asia/Kolkata")
MODEL_VERSION = "aerogrid-spatial-hgb-v2.0"


def compute_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    """Calculate key regression evaluation benchmarks."""
    return {
        "mae_ugm3": float(mean_absolute_error(y_true, y_pred)),
        "rmse_ugm3": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "bias_ugm3": float(np.mean(y_pred - y_true)),
        "r2": float(r2_score(y_true, y_pred)) if len(y_true) >= 2 else float("nan"),
    }


def make_model() -> Pipeline:
    """Build the production HistGradientBoosting pipeline with log1p target transformation."""
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("regressor", TransformedTargetRegressor(
            regressor=HistGradientBoostingRegressor(
                loss="squared_error",
                max_leaf_nodes=25,
                min_samples_leaf=25,
                l2_regularization=2.0,
                random_state=42,
            ),
            func=np.log1p,
            inverse_func=np.expm1,
        )),
    ])


def compute_spatial_features(
    target_lat: float,
    target_lon: float,
    target_elev: float,
    context_readings: List[Dict[str, Any]],
) -> Dict[str, float]:
    """Backward-compatible helper for contextual feature calculation."""
    if not context_readings:
        return {
            "dist_nearest_km": 0.0,
            "nearest_pm25": 0.0,
            "idw_pm25": 0.0,
            "regional_mean_pm25": 0.0,
            "regional_std_pm25": 0.0,
            "station_density_10km": 0.0,
        }

    distances = []
    values = []
    within_10km = 0

    for r in context_readings:
        d = haversine_km(target_lat, target_lon, float(r["latitude"]), float(r["longitude"]))
        distances.append(d)
        val = r.get("value") if "value" in r else r.get("pm2_5", r.get("pm25", 0.0))
        values.append(float(val))
        if d <= 10.0:
            within_10km += 1

    d_arr = np.array(distances)
    v_arr = np.array(values)
    min_idx = int(np.argmin(d_arr))

    weights = 1.0 / (np.maximum(d_arr, 0.1) ** 2)
    idw_val = float(np.sum(weights * v_arr) / np.sum(weights))

    return {
        "dist_nearest_km": float(d_arr[min_idx]),
        "nearest_pm25": float(v_arr[min_idx]),
        "idw_pm25": idw_val,
        "regional_mean_pm25": float(np.mean(v_arr)),
        "regional_std_pm25": float(np.std(v_arr)) if len(v_arr) > 1 else 0.0,
        "station_density_10km": float(within_10km),
    }


def train(pollutant: str = "pm25") -> dict[str, Any]:
    """Train and evaluate the spatial model for PM2.5 or PM10."""
    p = normalize_pollutant(pollutant)
    logger.info(f"Starting training pipeline for {p.upper()}...")

    # Look for dataset CSV or fallback to verified observation JSON
    dataset_csv = DATA_DIR / "training_dataset.csv"
    if dataset_csv.exists():
        frame = pd.read_csv(dataset_csv)
        frame["pollutant"] = frame["pollutant"].astype(str).str.lower()
        frame = frame.loc[frame["pollutant"] == p].copy()
    else:
        # Load from observations.json
        if not OBSERVATIONS_FILE.exists():
            raise FileNotFoundError(f"Observations file not found at {OBSERVATIONS_FILE}")
        with open(OBSERVATIONS_FILE, "r") as f:
            obs_list = json.load(f)
        pol_key = "pm2_5" if p == "pm25" else "pm10"
        rows = []
        for o in obs_list:
            if o.get("pollutant") == pol_key or pol_key in o:
                rows.append({
                    "location_id": o.get("station_id", "station"),
                    "location_name": o.get("station_name", "Station"),
                    "timestamp_utc": o.get("measurement_timestamp"),
                    "latitude": o.get("latitude"),
                    "longitude": o.get("longitude"),
                    "value_ugm3": o.get("value", o.get(pol_key)),
                    "temperature_2m": 25.0,
                    "relative_humidity_2m": 55.0,
                    "wind_speed_10m": 8.0,
                    "wind_direction_10m": 180.0,
                    "pressure_msl": 1012.0,
                })
        frame = pd.DataFrame(rows)

    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    frame["value_ugm3"] = pd.to_numeric(frame["value_ugm3"], errors="coerce")
    frame["latitude"] = pd.to_numeric(frame["latitude"], errors="coerce")
    frame["longitude"] = pd.to_numeric(frame["longitude"], errors="coerce")
    frame = frame.dropna(subset=["timestamp_utc", "value_ugm3", "latitude", "longitude", "location_id"])
    frame = frame.loc[frame["value_ugm3"] >= 0]

    n_rows = len(frame)
    n_locations = int(frame["location_id"].nunique())
    logger.info(f"Loaded {n_rows} observation records across {n_locations} monitoring locations.")

    y = frame["value_ugm3"].to_numpy(dtype=float)

    if n_locations >= 4:
        split = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
        train_idx, test_idx = next(split.split(frame, y, groups=frame["location_id"].astype(str)))
        eval_type = "spatial holdout: entire monitoring locations excluded from training"
        spatially_val = True
    else:
        train_idx, test_idx = train_test_split(np.arange(len(frame)), test_size=0.2, random_state=42)
        eval_type = "temporal/random holdout: fewer than 4 stations available"
        spatially_val = False

    train_frame = frame.iloc[train_idx].copy()
    test_frame = frame.iloc[test_idx].copy()

    X_train = make_model_features(train_frame, train_frame, LOCAL_TIMEZONE)
    X_test = make_model_features(test_frame, train_frame, LOCAL_TIMEZONE)

    eval_model = make_model()
    eval_model.fit(X_train, y[train_idx])
    test_pred = np.maximum(0, eval_model.predict(X_test))

    eval_metrics = compute_metrics(y[test_idx], test_pred)
    baseline_val = float(np.median(y[train_idx]))
    eval_metrics["training_median_baseline_mae_ugm3"] = float(mean_absolute_error(y[test_idx], np.full(len(test_idx), baseline_val)))
    eval_metrics["n_train"] = int(len(train_idx))
    eval_metrics["n_test"] = int(len(test_idx))
    eval_metrics["n_locations"] = n_locations
    eval_metrics["n_rows"] = n_rows
    eval_metrics["evaluation_type"] = eval_type
    eval_metrics["spatially_validated"] = spatially_val
    eval_metrics["pollutant"] = p
    eval_metrics["unit"] = "µg/m³"
    eval_metrics["created_at_utc"] = datetime.now(timezone.utc).isoformat()

    # Fit final production model on all rows
    X_all = make_model_features(frame, frame, LOCAL_TIMEZONE)
    final_model = make_model()
    final_model.fit(X_all, y)

    bundle = {
        "model": final_model,
        "feature_columns": FEATURE_COLUMNS,
        "pollutant": p,
        "timezone": LOCAL_TIMEZONE,
        "metrics": eval_metrics,
        "training_median": float(np.median(y)),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
    }

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    model_path = ARTIFACTS_DIR / f"{p}_model.joblib"
    metrics_path = ARTIFACTS_DIR / f"{p}_metrics.json"

    joblib.dump(bundle, model_path)
    metrics_path.write_text(json.dumps(eval_metrics, indent=2), encoding="utf-8")

    # If training PM2.5, keep canonical model.joblib in sync
    if p == "pm25":
        joblib.dump(bundle, ARTIFACTS_DIR / "model.joblib")

    logger.info(f"Model trained and saved to {model_path}")
    logger.info(f"Evaluation: MAE={eval_metrics['mae_ugm3']:.2f} µg/m³, RMSE={eval_metrics['rmse_ugm3']:.2f} µg/m³")
    return eval_metrics


def main():
    parser = argparse.ArgumentParser(description="Train AeroGrid spatial pollutant regressor.")
    parser.add_argument("--pollutant", choices=["pm25", "pm10"], default="pm25")
    args = parser.parse_args()
    train(args.pollutant)


if __name__ == "__main__":
    main()
