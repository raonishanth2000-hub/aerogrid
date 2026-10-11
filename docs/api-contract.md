# AeroGrid API contract

Served by `aerogrid/api.py` (`uvicorn aerogrid.api:app --port 8000`). All endpoints are `GET` unless
noted, return JSON, and allow CORS. Interactive docs: `http://localhost:8000/docs`.
Only PM2.5 is supported; any `pollutant=pm10` request returns `404` with the reason it was removed.

## `GET /api/health`
```json
{ "status": "ok", "model_available": true, "station_data_available": true, "prediction_available": true }
```
`status` is `"ok"` only when all three components are available, otherwise `"degraded"`.

## `GET /api/stations?pollutant=pm25&history_days=30`
Latest value per station from `data/training_dataset.csv`, with up to 90 days of history.
Rows dated after the current time (forecasts) are excluded. Returns `503` if the dataset is missing.
```json
{
  "stations": [{
    "id": "delhi_anand_vihar", "name": "Anand Vihar, Delhi",
    "latitude": 28.6476, "longitude": 77.3158,
    "pollutant": "PM2.5", "value": 87.8, "unit": "µg/m³",
    "source_type": "modelled",
    "timestamp": "2026-10-11T14:00:00+00:00",
    "data_source": "CAMS model (Copernicus) via Open-Meteo",
    "history": [{ "timestamp": "…", "value": 84.5 }]
  }]
}
```
`source_type` is `"measured"` for sensor data or `"modelled"` for model output such as CAMS. It is
set by `STATION_DATA_KIND` (default `modelled`) because the dataset itself has no provenance column.

## `GET /api/predict?lat={lat}&lon={lon}[&timestamp=ISO]`
An AeroGrid model estimate, never a measurement. `422` for invalid coordinates or points more than
(search radius + 15 km) from the study-area centre; `503` if the prediction pipeline is unavailable.
```json
{
  "location": { "name": null, "latitude": 28.61, "longitude": 77.21 },
  "pollutant": "PM2.5", "value": 72.4, "unit": "µg/m³",
  "source_type": "estimated",
  "timestamp": "2026-10-11T16:20:00+00:00",
  "uncertainty": { "lower": 61.2, "upper": 86.0, "confidence_level": 0.9 },
  "model_version": "pm25-hgb-2026-10-11",
  "observation_timestamp": null
}
```
`uncertainty` is an empirical 90% interval calibrated on held-out stations (see
[model-evaluation.md](model-evaluation.md)); it is `null` when no calibration has been published.

## `GET /api/metrics?pollutant=pm25`
Station-held-out cross-validation from `models/pm25_validation.json` when present (otherwise the
single split recorded at training time).
```json
{
  "model_name": "AeroGrid model (gradient boosting)", "model_version": "pm25-hgb-…",
  "evaluation_method": "grouped 5-fold spatial cross-validation (every station held out once); 38 stations",
  "sample_count": 4332, "mae": 3.03, "rmse": 9.61, "bias": -1.28, "r2": 0.895,
  "evaluated_at": "…", "training_period": "2026-10-07 – 2026-10-11",
  "baselines": [{ "method": "Nearest station", "mae": 1.50, "rmse": 8.65, "bias": 1.36, "r2": 0.915 }],
  "held_out_predictions": [{ "station_id": "…", "station_name": "…", "actual": 87.8, "predicted": 85.1 }]
}
```

## Kept for other clients
- `POST /api/predict` with `{ "latitude", "longitude", "pollutant", "timestamp" }`: original response shape.
- `GET /api/metrics/{pollutant}`: the raw training-time metrics file.
