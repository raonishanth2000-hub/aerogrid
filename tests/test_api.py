"""API tests for aerogrid.api. They run offline: model inference is stubbed where a
network call (weather, road data) would otherwise be needed."""
from __future__ import annotations

import json
from dataclasses import replace

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import aerogrid.api as api
from aerogrid.config import CITIES, get_city

CITY = get_city()
CENTER_LAT, CENTER_LON = CITY.latitude, CITY.longitude


@pytest.fixture(autouse=True)
def no_network_refresh(monkeypatch):
    monkeypatch.setenv("CAMS_AUTO_REFRESH", "0")


@pytest.fixture()
def client():
    api._station_cache.clear()
    api._latest_time_cache.clear()
    return TestClient(api.app)


@pytest.fixture()
def dataset(tmp_path, monkeypatch):
    """A small dataset with past observations, one missing value and one future (forecast) row."""
    now = pd.Timestamp.now(tz="UTC").floor("h")
    rows = []
    for i, (lat, lon) in enumerate([(CENTER_LAT, CENTER_LON), (CENTER_LAT + 0.05, CENTER_LON + 0.05)]):
        for h in range(5, 0, -1):
            rows.append(dict(location_id=f"S{i}", location_name=f"Station {i}", latitude=lat, longitude=lon,
                             timestamp_utc=(now - pd.Timedelta(hours=h)).isoformat(), pollutant="pm25",
                             value_ugm3=40.0 + i + h))
    rows.append(dict(location_id="S0", location_name="Station 0", latitude=CENTER_LAT, longitude=CENTER_LON,
                     timestamp_utc=(now + pd.Timedelta(hours=6)).isoformat(), pollutant="pm25", value_ugm3=999.0))
    path = tmp_path / "training_dataset.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    monkeypatch.setitem(CITIES, CITY.id, replace(CITY, dataset_path=path))
    return path


def test_root_lists_only_pm25(client):
    body = client.get("/").json()
    assert body["supported_pollutants"] == ["pm25"]


def test_health_reports_components(client):
    body = client.get("/api/health").json()
    assert body["status"] in {"ok", "degraded"}
    assert {"model_available", "station_data_available", "prediction_available"} <= set(body)


def test_stations_exclude_forecasts_and_label_kind(client, dataset):
    body = client.get("/api/stations").json()
    stations = {s["id"]: s for s in body["stations"]}
    assert set(stations) == {"S0", "S1"}
    s0 = stations["S0"]
    assert s0["value"] != 999.0, "a future (forecast) row must not be reported as the latest value"
    assert pd.Timestamp(s0["timestamp"]) <= pd.Timestamp.now(tz="UTC")
    assert s0["source_type"] == CITY.data_kind
    assert s0["data_source"] == CITY.data_source
    assert all(p["value"] != 999.0 for p in s0["history"])


def test_stations_unavailable_without_dataset(client, tmp_path, monkeypatch):
    monkeypatch.setitem(CITIES, CITY.id, replace(CITY, dataset_path=tmp_path / "missing.csv"))
    r = client.get("/api/stations")
    assert r.status_code == 503


@pytest.mark.parametrize("path", ["/api/stations?pollutant=pm10", "/api/metrics?pollutant=pm10", "/api/metrics/pm10"])
def test_pm10_is_removed(client, dataset, path):
    r = client.get(path)
    assert r.status_code == 404
    assert "PM10 has been removed" in r.json()["detail"]


def test_predict_rejects_points_outside_study_area(client):
    r = client.get("/api/predict", params={"lat": CENTER_LAT + 5, "lon": CENTER_LON})
    assert r.status_code == 422
    assert "km away" in r.json()["detail"]


def test_predict_rejects_invalid_coordinates(client):
    assert client.get("/api/predict", params={"lat": 95, "lon": 0}).status_code == 422
    assert client.get("/api/predict").status_code == 422


def test_predict_contract_and_calibrated_interval(client, tmp_path, monkeypatch):
    monkeypatch.setattr(api, "_run_prediction", lambda p, c, la, lo, dt: {"ml_prediction_ugm3": 50.0, "trained_at_utc": "2026-10-11T00:00:00+00:00"})
    validation = {"interval_90": {"level": 0.9, "low_ratio": 0.8, "high_ratio": 1.3, "empirical_coverage": 0.9}}
    monkeypatch.setattr(api, "_read_validation", lambda p, c: validation)
    body = client.get("/api/predict", params={"lat": CENTER_LAT, "lon": CENTER_LON}).json()
    assert body["source_type"] == "estimated"
    assert body["pollutant"] == "PM2.5"
    assert body["value"] == 50.0
    assert body["uncertainty"] == {"lower": 40.0, "upper": 65.0, "confidence_level": 0.9}


def test_predict_without_calibration_reports_no_interval(client, monkeypatch):
    monkeypatch.setattr(api, "_run_prediction", lambda p, c, la, lo, dt: {"ml_prediction_ugm3": 50.0, "trained_at_utc": None})
    monkeypatch.setattr(api, "_read_validation", lambda p, c: None)
    body = client.get("/api/predict", params={"lat": CENTER_LAT, "lon": CENTER_LON}).json()
    assert body["uncertainty"] is None


def test_metrics_prefers_cross_validation(client, tmp_path, monkeypatch):
    validation = {
        "evaluation_type": "grouped 5-fold spatial cross-validation", "n_locations": 10, "n_rows": 100,
        "metrics": {"mae_ugm3": 5.0, "rmse_ugm3": 7.0, "bias_ugm3": 0.1, "r2": 0.5},
        "baselines": [{"method": "IDW interpolation", "mae_ugm3": 6.0, "rmse_ugm3": 8.0, "bias_ugm3": 0.0}],
        "held_out_predictions": [{"station_id": "S0", "station_name": "S0", "actual": 10.0, "predicted": 11.0}],
        "data_start_utc": "2026-01-01T00:00:00+00:00", "data_end_utc": "2026-01-02T00:00:00+00:00",
        "created_at_utc": "2026-01-03T00:00:00+00:00",
    }
    (tmp_path / "pm25_validation.json").write_text(json.dumps(validation))
    monkeypatch.setitem(CITIES, CITY.id, replace(CITY, model_dir=tmp_path))
    body = client.get("/api/metrics").json()
    assert body["mae"] == 5.0
    assert body["sample_count"] == 100
    assert body["baselines"][0]["method"] == "IDW interpolation"
    assert len(body["held_out_predictions"]) == 1


def test_cities_lists_each_study_area(client):
    body = client.get("/api/cities").json()
    ids = {c["id"] for c in body["cities"]}
    assert {"delhi", "bengaluru"} <= ids
    kinds = {c["id"]: c["data_kind"] for c in body["cities"]}
    assert kinds["delhi"] == "modelled" and kinds["bengaluru"] == "measured"


def test_unknown_city_is_404(client):
    for path in ("/api/stations?city=atlantis", "/api/metrics?city=atlantis", "/api/health?city=atlantis"):
        assert client.get(path).status_code == 404


def test_study_area_follows_city(client, monkeypatch):
    calls = []
    monkeypatch.setattr(api, "_run_prediction", lambda p, c, la, lo, dt: calls.append(c.id) or {"ml_prediction_ugm3": 30.0})
    monkeypatch.setattr(api, "_read_validation", lambda p, c: None)
    blr = CITIES["bengaluru"]
    assert client.get("/api/predict", params={"lat": blr.latitude, "lon": blr.longitude}).status_code == 422
    r = client.get("/api/predict", params={"lat": blr.latitude, "lon": blr.longitude, "city": "bengaluru"})
    assert r.status_code == 200
    assert calls == ["bengaluru"]


def test_predict_defaults_to_latest_data_hour(client, dataset, monkeypatch):
    seen = {}

    def fake(p, c, la, lo, dt):
        seen["dt"] = pd.Timestamp(dt)
        return {"ml_prediction_ugm3": 30.0, "timestamp_utc": pd.Timestamp(dt).isoformat()}

    monkeypatch.setattr(api, "_run_prediction", fake)
    monkeypatch.setattr(api, "_read_validation", lambda p, c: None)
    body = client.get("/api/predict", params={"lat": CENTER_LAT, "lon": CENTER_LON}).json()
    latest = pd.Timestamp.now(tz="UTC").floor("h") - pd.Timedelta(hours=1)
    assert seen["dt"] == latest, "the estimate should use the latest hour that has station data, not a forecast hour"
    assert pd.Timestamp(body["observation_timestamp"]) == latest
