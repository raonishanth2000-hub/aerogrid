"""Spatial cross-validation and model comparison for PM2.5.

Compares candidate models against simple baselines on monitoring stations that are
held out from training, and optionally saves the best model if it genuinely wins.

    python -m aerogrid.experiments --pollutant pm25
    python -m aerogrid.experiments --pollutant pm25 --save-best

(PM10 was evaluated with this script and removed: no candidate beat a constant baseline.)

Every station is held out exactly once (grouped k-fold by location). For each fold,
neighbour features for held-out stations are built only from training stations, as in
train.py, so no held-out reading leaks into its own prediction.
"""
from __future__ import annotations

import argparse
import json
import shutil
from datetime import datetime, timezone

import joblib
import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, RegressorMixin, clone
from sklearn.compose import TransformedTargetRegressor
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupKFold
from sklearn.pipeline import Pipeline

from aerogrid.config import DATA_DIR, FEATURE_COLUMNS, LOCAL_TIMEZONE, MODEL_DIR
from aerogrid.features import drop_future_rows, make_model_features
from aerogrid.train import make_model, normalize_pollutant

# Static per-site inputs that can act as a station identifier when there are few stations.
LOCATION_IDENTITY = ["latitude", "longitude", "dist_to_center_km"]
NEIGHBOUR_COLUMNS = ["idw_neighbor_pm", "nearest_neighbor_pm", "second_neighbor_pm",
                     "nearest_station_distance_km", "neighbor_count"]


def _hgb(**overrides) -> HistGradientBoostingRegressor:
    params = dict(loss="squared_error", max_leaf_nodes=25, min_samples_leaf=25,
                  l2_regularization=2.0, random_state=42)
    params.update(overrides)
    return HistGradientBoostingRegressor(**params)


def _log_model(**overrides) -> Pipeline:
    return Pipeline([
        ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
        ("regressor", TransformedTargetRegressor(regressor=_hgb(**overrides), func=np.log1p, inverse_func=np.expm1)),
    ])


class ColumnSubsetModel(BaseEstimator, RegressorMixin):
    """Fits `base` on a subset of the feature columns (by name)."""

    def __init__(self, columns: list[str], base=None):
        self.columns = columns
        self.base = base

    def fit(self, X: pd.DataFrame, y):
        self.model_ = clone(self.base if self.base is not None else _log_model()).fit(X[self.columns], y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        return self.model_.predict(X[self.columns])


class ResidualOnIDW(BaseEstimator, RegressorMixin):
    """Predicts a correction to a neighbour estimate (IDW by default) in log space.

    Where no neighbour readings exist (e.g. live inference without station data), a
    fallback model trained without neighbour inputs is used instead.
    """

    def __init__(self, columns: list[str], fallback_columns: list[str], anchor: str = "idw_neighbor_pm"):
        self.columns = columns
        self.fallback_columns = fallback_columns
        self.anchor = anchor

    def fit(self, X: pd.DataFrame, y):
        y = np.asarray(y, dtype=float)
        idw = X[self.anchor].to_numpy(dtype=float)
        has = np.isfinite(idw)
        self.residual_ = Pipeline([
            ("imputer", SimpleImputer(strategy="median", keep_empty_features=True)),
            ("regressor", _hgb(min_samples_leaf=50, l2_regularization=5.0)),
        ])
        if has.sum() >= 50:
            self.residual_.fit(X.loc[has, self.columns], np.log1p(y[has]) - np.log1p(np.maximum(idw[has], 0)))
        else:
            self.residual_ = None
        self.fallback_ = _log_model().fit(X[self.fallback_columns], y)
        return self

    def predict(self, X: pd.DataFrame) -> np.ndarray:
        out = self.fallback_.predict(X[self.fallback_columns])
        idw = X[self.anchor].to_numpy(dtype=float)
        has = np.isfinite(idw)
        if self.residual_ is not None and has.any():
            correction = self.residual_.predict(X.loc[has, self.columns])
            out[has] = np.expm1(np.log1p(np.maximum(idw[has], 0)) + correction)
        return out


def candidates() -> dict[str, BaseEstimator]:
    no_identity = [c for c in FEATURE_COLUMNS if c not in LOCATION_IDENTITY]
    no_neighbours = [c for c in no_identity if c not in NEIGHBOUR_COLUMNS]
    return {
        "current (all features)": make_model(),
        "without location identity": ColumnSubsetModel(no_identity),
        "residual on IDW": ResidualOnIDW(no_identity, no_neighbours),
        "residual on nearest station": ResidualOnIDW(no_identity, no_neighbours, anchor="nearest_neighbor_pm"),
    }


def _metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    return {
        "mae_ugm3": float(mean_absolute_error(y_true, y_pred)),
        "rmse_ugm3": float(np.sqrt(mean_squared_error(y_true, y_pred))),
        "bias_ugm3": float(np.mean(y_pred - y_true)),
        "r2": float(r2_score(y_true, y_pred)),
    }


def interval_calibration(y_true: np.ndarray, y_pred: np.ndarray, level: float = 0.9) -> dict[str, float] | None:
    """Empirical prediction interval from held-out errors, as ratios of actual to predicted.

    Concentration errors grow with the level, so a multiplicative interval is used:
    [pred * low_ratio, pred * high_ratio] covers `level` of held-out stations' values.
    """
    ok = (y_pred > 0.5) & np.isfinite(y_true) & np.isfinite(y_pred)
    if ok.sum() < 50:
        return None
    ratio = y_true[ok] / y_pred[ok]
    tail = (1 - level) / 2
    low, high = float(np.quantile(ratio, tail)), float(np.quantile(ratio, 1 - tail))
    covered = (y_true[ok] >= y_pred[ok] * low) & (y_true[ok] <= y_pred[ok] * high)
    return {"level": level, "low_ratio": low, "high_ratio": high, "empirical_coverage": float(covered.mean())}


def load_frame(pollutant: str) -> pd.DataFrame:
    path = DATA_DIR / "training_dataset.csv"
    if not path.exists():
        raise FileNotFoundError(f"{path} not found. Add the dataset first.")
    frame = pd.read_csv(path)
    frame["pollutant"] = frame["pollutant"].astype(str).str.lower()
    frame = frame.loc[frame["pollutant"] == pollutant].copy()
    frame["timestamp_utc"] = pd.to_datetime(frame["timestamp_utc"], utc=True, errors="coerce")
    for col in ("value_ugm3", "latitude", "longitude"):
        frame[col] = pd.to_numeric(frame[col], errors="coerce")
    frame = frame.dropna(subset=["timestamp_utc", "value_ugm3", "latitude", "longitude", "location_id"])
    frame = frame.loc[frame["value_ugm3"] >= 0]
    frame = drop_future_rows(frame).reset_index(drop=True)
    return frame


def evaluate(pollutant: str, folds: int = 5, verbose: bool = True) -> dict:
    pollutant = normalize_pollutant(pollutant)
    frame = load_frame(pollutant)
    groups = frame["location_id"].astype(str).to_numpy()
    n_locations = len(set(groups))
    if n_locations < 3:
        raise ValueError(f"Need at least 3 stations for spatial cross-validation; found {n_locations}.")
    k = min(folds, n_locations)
    y = frame["value_ugm3"].to_numpy(dtype=float)
    models = candidates()
    preds = {name: np.full(len(y), np.nan) for name in [*models, "baseline: training median", "baseline: nearest station", "baseline: IDW"]}
    neighbour_coverage = np.zeros(len(y), dtype=bool)

    for fold, (train_idx, test_idx) in enumerate(GroupKFold(n_splits=k).split(frame, y, groups), start=1):
        train_frame, test_frame = frame.iloc[train_idx], frame.iloc[test_idx]
        X_train = make_model_features(train_frame, train_frame, LOCAL_TIMEZONE)
        X_test = make_model_features(test_frame, train_frame, LOCAL_TIMEZONE)
        median = float(np.median(y[train_idx]))
        nearest = X_test["nearest_neighbor_pm"].to_numpy(dtype=float)
        idw = X_test["idw_neighbor_pm"].to_numpy(dtype=float)
        neighbour_coverage[test_idx] = np.isfinite(idw)
        preds["baseline: training median"][test_idx] = median
        preds["baseline: nearest station"][test_idx] = np.where(np.isfinite(nearest), nearest, median)
        preds["baseline: IDW"][test_idx] = np.where(np.isfinite(idw), idw, median)
        for name, model in models.items():
            fitted = clone(model).fit(X_train, y[train_idx])
            preds[name][test_idx] = np.maximum(0, fitted.predict(X_test))
        if verbose:
            held = sorted(set(groups[test_idx]))
            print(f"fold {fold}/{k}: held out {len(held)} stations, {len(test_idx):,} rows")

    results = {name: _metrics(y, p) for name, p in preds.items()}
    for name in models:
        results[name]["interval_90"] = interval_calibration(y, preds[name])
    # A reproducible sample of out-of-fold predictions from the current model, for an actual-vs-predicted plot.
    sample = np.random.default_rng(42).choice(len(y), size=min(500, len(y)), replace=False)
    held_out = [
        {
            "station_id": str(frame.at[i, "location_id"]),
            "station_name": None if pd.isna(frame.at[i, "location_name"]) else str(frame.at[i, "location_name"]),
            "actual": round(float(y[i]), 1),
            "predicted": round(float(preds["current (all features)"][i]), 1),
        }
        for i in sorted(sample)
    ]
    report = {
        "pollutant": pollutant,
        "evaluation_type": f"grouped {k}-fold spatial cross-validation (every station held out once)",
        "n_rows": int(len(y)),
        "n_locations": int(n_locations),
        "neighbour_coverage": float(neighbour_coverage.mean()),
        "results": results,
        "held_out_predictions": held_out,
        "data_start_utc": frame["timestamp_utc"].min().isoformat(),
        "data_end_utc": frame["timestamp_utc"].max().isoformat(),
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    (DATA_DIR / f"experiments_{pollutant}.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    if verbose:
        print(f"\n{pollutant.upper()} — {report['evaluation_type']}; {n_locations} stations, {len(y):,} rows; "
              f"neighbour readings available for {report['neighbour_coverage']:.0%} of rows")
        print(f"{'method':32} {'MAE':>7} {'RMSE':>7} {'bias':>7} {'R²':>6}")
        for name, m in sorted(results.items(), key=lambda kv: kv[1]["mae_ugm3"]):
            print(f"{name:32} {m['mae_ugm3']:7.2f} {m['rmse_ugm3']:7.2f} {m['bias_ugm3']:+7.2f} {m['r2']:6.3f}")
    return report


def save_best(report: dict) -> str | None:
    """Fit the best candidate on all data and save it, only if it beats every baseline and the current model."""
    pollutant = report["pollutant"]
    results = report["results"]
    baseline_mae = min(m["mae_ugm3"] for n, m in results.items() if n.startswith("baseline"))
    current_mae = results["current (all features)"]["mae_ugm3"]
    model_names = [n for n in candidates()]
    best = min(model_names, key=lambda n: results[n]["mae_ugm3"])
    best_mae = results[best]["mae_ugm3"]
    if best == "current (all features)" or best_mae >= baseline_mae or best_mae >= current_mae:
        print(f"\nNot saving: best candidate '{best}' (MAE {best_mae:.2f}) does not beat the current model "
              f"(MAE {current_mae:.2f}) and every baseline (best baseline MAE {baseline_mae:.2f}).")
        return None

    frame = load_frame(pollutant)
    y = frame["value_ugm3"].to_numpy(dtype=float)
    X_all = make_model_features(frame, frame, LOCAL_TIMEZONE)
    model = clone(candidates()[best]).fit(X_all, y)

    model_path = MODEL_DIR / f"{pollutant}_model.joblib"
    metrics_path = MODEL_DIR / f"{pollutant}_metrics.json"
    for path in (model_path, metrics_path):
        if path.exists():
            shutil.copy2(path, path.with_name(path.stem + ".previous" + path.suffix))

    metrics = {
        **{k: v for k, v in results[best].items() if k != "interval_90"},
        "training_median_baseline_mae_ugm3": results["baseline: training median"]["mae_ugm3"],
        "baselines": [
            {"method": label, **results[name]}
            for name, label in (
                ("baseline: training median", "Training median (constant)"),
                ("baseline: nearest station", "Nearest station"),
                ("baseline: IDW", "IDW interpolation"),
            )
        ],
        "n_rows": report["n_rows"],
        "n_locations": report["n_locations"],
        "n_test": report["n_rows"],
        "evaluation_type": report["evaluation_type"],
        "spatially_validated": True,
        "model_variant": best,
        "pollutant": pollutant,
        "unit": "µg/m³",
        "data_start_utc": frame["timestamp_utc"].min().isoformat(),
        "data_end_utc": frame["timestamp_utc"].max().isoformat(),
        "created_at_utc": datetime.now(timezone.utc).isoformat(),
    }
    bundle = {
        "model": model,
        "feature_columns": FEATURE_COLUMNS,
        "pollutant": pollutant,
        "timezone": LOCAL_TIMEZONE,
        "metrics": metrics,
        "training_median": float(np.median(y)),
        "trained_at_utc": metrics["created_at_utc"],
        "training_data_path": str(DATA_DIR / "training_dataset.csv"),
    }
    joblib.dump(bundle, model_path)
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding="utf-8")
    print(f"\nSaved '{best}' to {model_path} (previous model kept as {model_path.stem}.previous.joblib)")
    return best


def publish_validation(report: dict, model_name: str) -> None:
    """Write the station-held-out results of the deployed model configuration for the API."""
    pollutant = report["pollutant"]
    results = report["results"]
    payload = {
        "pollutant": pollutant,
        "model_variant": model_name,
        "evaluation_type": report["evaluation_type"],
        "n_rows": report["n_rows"],
        "n_locations": report["n_locations"],
        "metrics": {k: v for k, v in results[model_name].items() if k != "interval_90"},
        "interval_90": results[model_name].get("interval_90"),
        "baselines": [
            {"method": label, **results[name]}
            for name, label in (
                ("baseline: training median", "Training median (constant)"),
                ("baseline: nearest station", "Nearest station"),
                ("baseline: IDW", "IDW interpolation"),
            )
        ],
        "held_out_predictions": report["held_out_predictions"] if model_name == "current (all features)" else None,
        "data_start_utc": report["data_start_utc"],
        "data_end_utc": report["data_end_utc"],
        "created_at_utc": report["created_at_utc"],
    }
    path = MODEL_DIR / f"{pollutant}_validation.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Published cross-validation results to {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--pollutant", choices=["pm25"], default="pm25")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--save-best", action="store_true", help="Save the best model if it beats the current one and all baselines")
    parser.add_argument("--publish", action="store_true",
                        help="Write the cross-validation results to models/<pollutant>_validation.json for the API and website")
    args = parser.parse_args()
    report = evaluate(args.pollutant, args.folds)
    saved = save_best(report) if args.save_best else None
    if args.publish:
        publish_validation(report, saved or "current (all features)")


if __name__ == "__main__":
    main()
