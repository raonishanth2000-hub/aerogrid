# AeroGrid Implementation Checklist & Architecture

## System Architecture

```
                 +-------------------------------------------------------+
                 |               AeroGrid Frontend (React 19)            |
                 |  - Neumorphic UI / Tailwind CSS tokens / Lucide Icons |
                 |  - 10 Functional Workspaces & Navigation Routes       |
                 |  - Leaflet Map + Recharts Visualizations             |
                 +---------------------------+---------------------------+
                                             | HTTP / REST (Vite Proxy)
                                             v
                 +-------------------------------------------------------+
                 |              AeroGrid FastAPI Backend (v1)            |
                 |  - App Router: /api/v1/... (with /api/... alias)      |
                 |  - Dependency Injection for Providers & Services      |
                 +---------------------------+---------------------------+
                                             |
        +------------------+-----------------+-------------------+-------------------+
        |                  |                 |                   |                   |
        v                  v                 v                   v                   v
+---------------+  +---------------+  +---------------+  +---------------+  +---------------+
| Data Service  |  | Alert Engine  |  | ML Provider   |  | S3 Storage    |  | Persistence   |
| - OpenAQ /    |  | - Type A (Obs)|  | - Interface   |  | - Boto3 S3    |  | - SQLite DB   |
|   CPCB Feeds  |  | - Type B (Fcst|  | - Unavailable |  | - Safe Local  |  | - Rules,      |
| - Caching     |  | - Deduplication|  | - Demo Provider| |   Fallback   |  |   Alerts,      |
| - CPCB AQI    |  | - Hysteresis  |  | - Scikit-Learn|  | - Model Artifact| | Notifications|
|   Calculator  |  | - Cooldown    |  |   Adapter     |  |   Bucket      |  | - Campuses    |
+---------------+  +---------------+  +---------------+  +---------------+  +---------------+
```

## Implementation Checklist

### Phase 1: Architecture & Project Setup
- [x] Inspect existing frontend and dependencies.
- [x] Install required Python dependencies (`pandas`, `numpy`, `scikit-learn`, `joblib`, `boto3`, `fastapi`, `uvicorn`, `httpx`, `pytest`).
- [x] Define system architecture and API contract.

### Phase 2: Design System & 10 Functional Navigation Pages
- [x] Update navigation items and routing to include all 10 required pages:
  1. Overview
  2. Live Air Quality
  3. Explore Map
  4. Forecast and Risk
  5. Alerts and Notifications
  6. Prevention and Action
  7. Monitoring Gaps
  8. ML Lab
  9. Data Sources
  10. Settings (including Schools/Universities Campus Mode)
- [x] Create/update Neumorphic UI components and ensure loading, error, and empty states on all pages.

### Phase 3: Backend Architecture & Persistence
- [x] Set up `backend/` directory structure:
  - `backend/app/main.py`
  - `backend/app/config.py`
  - `backend/app/schemas/`
  - `backend/app/db/` (SQLite database models & repositories)
  - `backend/app/services/`
  - `backend/app/providers/`
  - `backend/app/api/v1/`
  - `backend/app/utils/`
- [x] Implement database schema:
  - Alert rules (location, pollutant, threshold, severity, cooldown, notification preference)
  - Alert history / events (evidence, timestamps, status, acknowledgements)
  - Notifications (in-app, delivery status, read status)
  - Interventions (issue, action, responsible party, coordinates, status)
  - Campuses (Schools & Universities profile, coordinates, radius, threshold)
  - App settings (data provider, CPCB AQI configs, freshness minutes, demo mode toggle)

### Phase 4: Data Ingestion, Official AQI Calculation & Station APIs
- [x] Implement official Indian CPCB NAQI calculation with sub-indices for PM2.5, PM10, NO2, SO2, CO, O3.
- [x] Implement Data Providers:
  - OpenAQ / real ambient station feeds with TTL cache.
  - Deterministic Demo Provider (clearly tagged `DEMO DATA`).
- [x] Implement endpoints:
  - `GET /api/v1/health`
  - `GET /api/v1/meta`
  - `GET /api/v1/stations`
  - `GET /api/v1/stations/{station_id}/readings`
  - `GET /api/v1/readings/latest`
  - `GET /api/v1/readings/history`
  - `GET /api/v1/coverage`

### Phase 5: Alert Engine, Rule Management & Notification Center
- [x] Implement Type A (Current Condition) and Type B (Forecast Risk) Alert Engine.
- [x] Add hysteresis, duplicate suppression, and cooldown.
- [x] Implement alert endpoints:
  - `GET /api/v1/alerts`
  - `GET /api/v1/alerts/{alert_id}`
  - `POST /api/v1/alerts/{alert_id}/acknowledge`
  - `GET /api/v1/alert-rules`
  - `POST /api/v1/alert-rules`
  - `PATCH /api/v1/alert-rules/{rule_id}`
  - `DELETE /api/v1/alert-rules/{rule_id}`
  - `POST /api/v1/alerts/evaluate`
- [x] Implement Notification Center:
  - `GET /api/v1/notifications`
  - `PATCH /api/v1/notifications/{notification_id}/read`
  - `POST /api/v1/notifications/test`

### Phase 6: Precautions, Actions, Interventions & Campus Mode
- [x] Implement Recommendation Service:
  - Exposure Reduction vs. Emission Reduction categories.
  - Audience filtering (Individuals, Schools, Transport, Construction, Municipal).
  - Quantitative/qualitative expected benefits.
  - `GET /api/v1/recommendations`
- [x] Implement Community Interventions:
  - `POST /api/v1/interventions`
  - `GET /api/v1/interventions`
- [x] Implement Campus Mode:
  - `GET /api/v1/campuses`
  - `POST /api/v1/campuses`
  - `GET /api/v1/campuses/{campus_id}/status`

### Phase 7: ML Lab & Provider Interfaces
- [x] Build typed ML Provider interface:
  - `get_model_status()`
  - `predict_location(lat, lon, features)`
  - `forecast_location(lat, lon, horizon_hours, features)`
  - `get_evaluation_metrics()`
- [x] Implement `UnavailableMLProvider` (honest default).
- [x] Implement `DemoMLProvider` (explicitly activated in demo mode).
- [x] Implement `TrainedModelAdapter` for scikit-learn / joblib models.
- [x] Implement ML endpoints:
  - `GET /api/v1/predict`
  - `GET /api/v1/forecasts`
  - `GET /api/v1/ml/status`
  - `GET /api/v1/ml/metrics`

### Phase 8: AWS S3 Storage & Deployment
- [x] Implement S3 Storage Provider with Boto3.
- [x] Graceful fallback when AWS credentials are unset.
- [x] Create `Dockerfile` and `docker-compose.yml`.
- [x] Write AWS architecture guide in `docs/aws_architecture.md`.

### Phase 9: Connect Frontend Pages to Backend
- [x] Update frontend API client (`src/services/api.ts`) to consume all backend endpoints.
- [x] Wire all 10 pages to live backend data with loading/error/empty states.
- [x] Test browser notifications and interactive modals.

### Phase 10: Verification, Testing & Documentation
- [x] Write comprehensive backend pytest suite (unit + integration): **22 / 22 tests passing**.
- [x] Run frontend vitest suite and linting: **29 / 29 tests passing**, **0 TypeScript errors**, **0 ESLint errors**.
- [x] Integrate teammate's ML model: **100-tree Spatial Random Forest (`ml/artifacts/model.joblib`)**, 13 features, 5-Fold cross-validation MAE 1.42 µg/m³, R² 0.951.
- [x] Start FastAPI (`http://localhost:8000`) and Vite (`http://localhost:5173`), test end-to-end workflows.
- [x] Provide complete report with commands, tests, endpoints, and limitations.

### Phase 11: Native macOS Desktop Application (.app & .dmg)
- [x] Create high-resolution Retina macOS icon (`desktop/resources/AppIcon.icns`).
- [x] Configure standard Apple bundle manifest (`desktop/resources/Info.plist`).
- [x] Write native Swift Cocoa + WebKit desktop wrapper (`desktop/src/main.swift`):
  - Dynamic port binding and health check polling.
  - Automatic background Python FastAPI lifecycle management.
  - Clean child process termination on window close and application quit.
  - Native menus: Zoom, Reload, Full Screen, Edit, About.
- [x] Ad-hoc sign executable and bundle for Apple Silicon (`codesign -s - --force --deep`).
- [x] Package into standard macOS `.dmg` installer with `/Applications` drag-and-drop symlink using `hdiutil`.
- [x] Verified deliverables:
  - Bundle: `dist/AeroGrid.app`
  - Installer: `dist/AeroGrid-1.0.0.dmg` (3.6 MB)

## Verified Test Runs
```bash
# Backend test suite
python3 -m pytest backend/tests -v
# Output: 22 passed, 2 warnings in 1.87s

# Frontend test suite
npm test (vitest run)
# Output: 4 passed, 29 passed in 124ms

# Frontend compilation
npm run typecheck && npm run build
# Output: tsc -b && vite build => SUCCESS

# Desktop application packaging
./desktop/build_package.sh
# Output: Created dist/AeroGrid.app & dist/AeroGrid-1.0.0.dmg (3.6 MB)
```
