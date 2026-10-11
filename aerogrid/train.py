"""Train and evaluate a spatial/weather baseline for PM2.5."""
from __future__ import annotations

import argparse
import json
import warnings
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline

from aerogrid.config import CITIES, DATA_DIR, FEATURE_COLUMNS, LOCAL_TIMEZONE, City, get_city
from aerogrid.features import drop_future_rows, make_model_features


def normalize_pollutant(value: str) -> str:
    compact = "".join(ch for ch in str(value).lower() if ch.isalnum())
    if compact in {"pm25", "pm2"}:
        return "pm25"
    if compact == "pm10":
        raise ValueError("PM10 has been removed: under station-held-out validation it was no better than predicting the typical value.")
    raise ValueError("Pollutant must be 'pm25'.")


def metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mae_ugm3": float(mean_absolute_error(y_true, y_pred)),
        "rmse_ugm3": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "bias_ugm3": float(np.mean(y_pred - y_true)),
        "r2": float(r2_score(y_true, y_pred)) if len(y_true) >= 2 else float("nan"),
    }


def make_model() -> Pipeline:
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


def train(pollutant: str, city: City | None = None) -> dict:
    pollutant = normalize_pollutant(pollutant)
    city = city or get_city()
    center = (city.latitude, city.longitude)
    dataset_path = city.dataset_path
    if not dataset_path.exists():
        raise FileNotFoundError(
            f"{dataset_path} was not found. First run: python -m aerogrid.fetch_data"
        )

    frame = pd.read_csv(dataset_path)
    frame["pollutant"] = frame["pollutant"].astype(str).str.lower()
    frame = frame.loc[frame["pollutant"] == pollutant].copy()
    if frame.empty:
        raise ValueError(f"No rows for {pollutant} in {dataset_path}. Try fetching more data or another pollutant.")

    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    frame["value_ugm3"] = pd.to_numeric(frame["value_ugm3"], errors="coerce")
    frame["latitude"] = pd.to_numeric(frame["latitude"], errors="coerce")
    frame["longitude"] = pd.to_numeric(frame["longitude"], errors="coerce")
    frame = frame.dropna(subset=["timestamp_utc", "value_ugm3", "latitude", "longitude", "location_id"])
    frame = frame.replace([np.inf, -np.inf], np.nan)
    frame = frame.loc[frame["value_ugm3"] >= 0]
    frame = drop_future_rows(frame)

    n_rows = len(frame)
    n_locations = int(frame["location_id"].nunique())
    if n_rows < 60:
        raise ValueError(
            f"Only {n_rows} usable {pollutant} rows were found. Aim for at least 60 to test the pipeline; "
            "a larger and seasonally diverse dataset is better. Extend the date range or study area."
        )
    if n_locations < 2:
        raise ValueError(
            f"Only {n_locations} independent monitoring location(s) were found. A model cannot be tested "
            "for unmonitored locations with just one station. Widen the search area or use another city."
        )

    y = frame["value_ugm3"].to_numpy(dtype=float)

    if n_locations >= 4:
        split = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
        train_idx, test_idx = next(split.split(frame, y, groups=frame["location_id"].astype(str)))
        evaluation_type = "spatial holdout: entire monitoring locations excluded from training"
        spatially_validated = True
    else:
        # This is a weaker evaluation, explicitly labelled rather than misrepresented as spatial validation.
        ordered = np.argsort(frame["timestamp_utc"].astype("int64").to_numpy())
        cut = max(1, int(len(ordered) * 0.8))
        train_idx, test_idx = ordered[:cut], ordered[cut:]
        if len(test_idx) < 2 or len(train_idx) < 10:
            train_idx, test_idx = train_test_split(np.arange(len(frame)), test_size=0.2, random_state=42)
            evaluation_type = "random row split: weak validation because fewer than 4 locations are available"
        else:
            evaluation_type = "temporal holdout: later rows tested; spatial generalization remains unproven"
        spatially_validated = False

    train_frame = frame.iloc[train_idx].copy()
    test_frame = frame.iloc[test_idx].copy()
    # Critical for a fair station holdout: validation rows can only use readings
    # from training stations as neighbour features.
    X_train = make_model_features(train_frame, train_frame, LOCAL_TIMEZONE, center)
    X_test = make_model_features(test_frame, train_frame, LOCAL_TIMEZONE, center)
    evaluation_model = make_model()
    evaluation_model.fit(X_train, y[train_idx])
    test_pred = np.maximum(0, evaluation_model.predict(X_test))
    eval_metrics = metrics(y[test_idx], test_pred)
    baseline_value = float(np.median(y[train_idx]))
    eval_metrics["training_median_baseline_mae_ugm3"] = float(mean_absolute_error(y[test_idx], np.full(len(test_idx), baseline_value)))
    eval_metrics["n_train"] = int(len(train_idx))
    eval_metrics["n_test"] = int(len(test_idx))
    eval_metrics["n_locations"] = n_locations
    eval_metrics["n_rows"] = n_rows
    eval_metrics["evaluation_type"] = evaluation_type
    eval_metrics["spatially_validated"] = spatially_validated
    eval_metrics["pollutant"] = pollutant
    eval_metrics["city"] = city.id
    eval_metrics["unit"] = "µg/m³"
    eval_metrics["data_start_utc"] = frame["timestamp_utc"].min().isoformat()
    eval_metrics["data_end_utc"] = frame["timestamp_utc"].max().isoformat()
    eval_metrics["created_at_utc"] = datetime.now(timezone.utc).isoformat()

    predictions = frame.iloc[test_idx][[
        "location_id", "location_name", "timestamp_utc", "latitude", "longitude", "value_ugm3"
    ]].copy()
    predictions["predicted_ugm3"] = test_pred
    predictions["absolute_error_ugm3"] = np.abs(predictions["predicted_ugm3"] - predictions["value_ugm3"])
    predictions_path = DATA_DIR / f"holdout_predictions_{pollutant}{city.file_suffix}.csv"
    predictions.to_csv(predictions_path, index=False)

    # Fit the model used by the app on all available observations after recording holdout metrics.
    X_all = make_model_features(frame, frame, LOCAL_TIMEZONE, center)
    final_model = make_model()
    final_model.fit(X_all, y)
    bundle = {
        "model": final_model,
        "feature_columns": FEATURE_COLUMNS,
        "pollutant": pollutant,
        "city": city.id,
        "center": center,
        "timezone": LOCAL_TIMEZONE,
        "metrics": eval_metrics,
        "training_median": float(np.median(y)),
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "training_data_path": str(dataset_path),
    }
    city.model_dir.mkdir(parents=True, exist_ok=True)
    model_path = city.model_dir / f"{pollutant}_model.joblib"
    metrics_path = city.model_dir / f"{pollutant}_metrics.json"
    joblib.dump(bundle, model_path)
    metrics_path.write_text(json.dumps(eval_metrics, indent=2, allow_nan=True), encoding="utf-8")

    print(f"\nTrained {pollutant.upper()} model for {city.name}.")
    print(f"Rows: {n_rows:,} | independent locations: {n_locations}")
    print(f"Evaluation: {evaluation_type}")
    print(f"MAE: {eval_metrics['mae_ugm3']:.2f} µg/m³")
    print(f"RMSE: {eval_metrics['rmse_ugm3']:.2f} µg/m³")
    print(f"Bias: {eval_metrics['bias_ugm3']:.2f} µg/m³")
    print(f"R²: {eval_metrics['r2']:.3f}")
    print(f"Median-baseline MAE: {eval_metrics['training_median_baseline_mae_ugm3']:.2f} µg/m³")
    if not spatially_validated:
        warnings.warn("This result does not prove that predictions generalize to unmonitored locations.", RuntimeWarning)
    print(f"Model saved to: {model_path}")
    print(f"Metrics saved to: {metrics_path}")
    print(f"Held-out predictions saved to: {predictions_path}")
    return eval_metrics


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pollutant", choices=["pm25"], default="pm25")
    parser.add_argument("--city", choices=sorted(CITIES), default=None, help="Study area (default: AEROGRID_CITY or delhi)")
    args = parser.parse_args()
    train(args.pollutant, get_city(args.city))


if __name__ == "__main__":
    main()
