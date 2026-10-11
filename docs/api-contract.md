# AeroGrid REST API Contract Specifications

All endpoints are versioned under `/api/v1` and mirrored under `/api` for backward compatibility. Responses include `X-Request-ID` tracing headers.

---

## 1. System Endpoints

### `GET /api/v1/health`
Returns system health, readiness, active data modes, and deployment metadata. Zero secrets exposed.
- **Status Codes**: `200 OK`
- **Response**:
```json
{
  "status": "ok",
  "app_name": "AeroGrid",
  "app_version": "1.0.0",
  "environment": "production",
  "data_mode": "demo",
  "data_provider_health": "healthy",
  "ml_connected": true,
  "appconfig_connected": false,
  "database_connected": true,
  "deployment": {
    "image_tag": "latest",
    "commit_hash": "a1b2c3d",
    "build_id": "build-42",
    "pipeline_stage": "production"
  }
}
```

### `GET /api/v1/health/readiness`
Deep dependency readiness probe used by AWS CodeDeploy and ALB target groups.
- **Status Codes**: `200 OK` (Ready), `503 Service Unavailable` (Dependency failure)

### `GET /api/v1/meta`
Public application metadata, CPCB regulatory standards, and supported geographic regions.

---

## 2. Stations & Telemetry

### `GET /api/v1/stations`
Retrieve monitoring station directory with optional filtering and pagination.
- **Query Parameters**:
  - `city` (string, default: "Delhi"): Monitoring region
  - `q` (string, optional): Substring search on station name
  - `pollutant` (string, optional): Specific pollutant filter (e.g. "PM2.5")
  - `is_stale` (boolean, optional): Filter by observation age (>3 hours)
  - `limit` (integer, default: 50): Number of stations per page
  - `offset` (integer, default: 0): Page offset
- **Status Codes**: `200 OK`

### `GET /api/v1/stations/{id}/readings`
Historical observation time-series and sensor data provenance.
- **Status Codes**: `200 OK`, `404 Not Found`

---

## 3. Spatial ML & Metrics

### `GET /api/v1/predict`
Executes Spatial Random Forest spatial interpolation with calibrated 95% confidence bounds.
- **Query Parameters**:
  - `latitude` (float, required): -90.0 to 90.0
  - `longitude` (float, required): -180.0 to 180.0
  - `pollutant` (string, default: "PM2.5")
- **Status Codes**: `200 OK`, `422 Unprocessable Content` (out-of-bounds coordinates)

### `GET /api/v1/metrics`
Genuine 5-Fold Spatial Station Cross-Validation benchmark metrics and baseline comparisons (IDW, Nearest Station).
- **Status Codes**: `200 OK`

### `GET /api/v1/coverage`
Spatial monitoring coverage gaps, unmonitored zones, and ranked candidate coordinates.
- **Status Codes**: `200 OK`

---

## 4. Standard Error Codes

| Error Code | HTTP Status | Meaning |
| :--- | :--- | :--- |
| `NOT_FOUND` | 404 | Station or resource does not exist |
| `VALIDATION_ERROR` | 422 | Out-of-bounds coordinates or invalid parameters |
| `PROVIDER_UNAVAILABLE`| 503 | Underlying ML model or data provider is unconfigured |
| `INTERNAL_ERROR` | 500 | Unhandled server exception |
