# AeroGrid — Location-Aware Environmental Intelligence & Early Warning Platform

AeroGrid is an environmental intelligence system that fuses real-time reference ground sensors (CPCB/DPCC/IMD), spatial Machine Learning interpolation, dynamic AWS AppConfig feature flags, and zero-downtime AWS CI/CD pipelines.

---

## Architecture & File Structure

```
aerogrid/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app entrypoint, CORS, Request-ID tracing, error handlers
│   │   ├── config.py                # Pydantic Settings (env, storage mode, CORS, freshness)
│   │   ├── schemas.py               # Typed Pydantic models with provenance and status tags
│   │   ├── api/
│   │   │   ├── health.py            # GET /api/v1/health (component readiness, zero secrets)
│   │   │   ├── stations.py          # GET /api/v1/stations (filters, search, pagination)
│   │   │   ├── readings.py          # GET /api/v1/stations/{id}/readings (history & provenance)
│   │   │   ├── predict.py           # GET /api/v1/predict (spatial RF inference + 95% CI)
│   │   │   ├── metrics.py           # GET /api/v1/metrics (genuine spatial CV evaluation)
│   │   │   ├── coverage.py          # GET /api/v1/coverage (spatial network gaps & candidate sites)
│   │   │   └── meta.py              # GET /api/v1/meta (public application metadata)
│   │   ├── services/
│   │   │   ├── data_service.py      # Station catalog, observation history, freshness tracking
│   │   │   ├── prediction_service.py# Context feature orchestration, model inference, demo fallback
│   │   │   ├── metrics_service.py   # Held-out benchmark metrics and pending state handler
│   │   │   ├── coverage_service.py  # Spatial isolation scoring and candidate ranking
│   │   │   └── storage_service.py   # Dual-backend storage abstraction (Local disk / Amazon S3)
│   │   └── utils/
│   │       ├── errors.py            # Custom HTTP exceptions and standard error formats
│   │       └── validation.py        # Coordinate and pollutant validation helpers
│   ├── tests/
│   │   └── test_all_endpoints.py    # Pytest test suite covering all endpoints & edge cases
│   ├── requirements.txt             # Python backend dependencies
│   └── Dockerfile                   # Production container with non-root security & healthcheck
├── ml/
│   ├── train.py                     # Spatial Random Forest regressor training pipeline
│   ├── evaluate.py                  # 5-Fold Spatial Station Cross-Validation evaluator
│   ├── predict.py                   # Standalone inference engine with calibrated uncertainty bounds
│   ├── requirements.txt             # ML pipeline dependencies
│   ├── README.md                    # ML methodology, feature formulation & spatial CV guide
│   └── artifacts/
│       ├── model.joblib             # Serialized Spatial Random Forest model artifact
│       ├── model_meta.json          # Model versioning, hyperparameter & feature metadata
│       └── metrics.json             # Genuine evaluation benchmarks, baselines & residuals
├── data/
│   ├── stations.json                # 38 verified CAAQMS stations across Delhi NCR (CPCB/DPCC/IMD)
│   ├── ingest.py                    # Real observation ingestion, deduplication & cleaning pipeline
│   ├── README.md                    # Data provenance, quality flags, and units specification
│   └── samples/
│       ├── observations.json        # 6,878 verified observation records with full provenance
│       └── raw_ingest.json          # Raw atmospheric ingestion payloads
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Navbar.tsx           # Dark forest-green header, navigation, and live status pill
│   │   │   ├── MapView.tsx          # Leaflet GIS map with OSM Carto tiles & point-click estimation
│   │   │   ├── StationDetailDrawer.tsx # Slide-out drawer with telemetry & Recharts time series
│   │   │   ├── PredictionCard.tsx   # Floating inspector showing estimate, 95% CI & baselines
│   │   │   └── StatusBadge.tsx      # Badges for measured, estimated, stale, unavailable, demo
│   │   ├── pages/
│   │   │   ├── Overview.tsx         # City KPIs, reference station summary, model readiness
│   │   │   ├── ExploreMap.tsx       # Interactive GIS workspace, station search, and point predictor
│   │   │   ├── ModelLab.tsx         # Model vs IDW vs Nearest baselines, error charts & residuals
│   │   │   ├── MonitoringCoverage.tsx# Spatial extent, candidate sites & ranking rationale
│   │   │   └── About.tsx            # Mission, data providers, and measured vs estimated guide
│   │   ├── services/api.ts          # Typed API client with error handling
│   │   ├── types/index.ts           # Domain models for stations, readings, predictions, metrics
│   │   ├── App.tsx                  # Root component orchestrating state and view tabs
│   │   ├── main.tsx                 # React DOM mount point
│   │   └── index.css                # Tailwind directives and Leaflet custom styling
│   ├── package.json                 # React, Vite, Leaflet, Recharts, Lucide, Tailwind
│   ├── vite.config.ts               # Vite bundler with API proxy to port 8000
│   ├── tsconfig.json                # TypeScript compiler configuration
│   └── tailwind.config.js           # Forest-green, teal, and sage styling palette
├── docs/
│   ├── architecture.md              # Architectural blueprint with Mermaid diagrams
│   ├── api-contract.md              # Complete REST endpoint specifications & error codes
│   ├── data-sources.md              # Data sources provenance & cleaning standards
│   ├── aws-deployment.md            # AWS S3 integration, App Runner deployment & IAM policies
│   ├── model-evaluation.md          # Spatial cross-validation benchmarks & uncertainty calibration
│   └── demo-script.md               # Concise judge-facing walkthrough script
├── docker-compose.yml               # Multi-container orchestration (backend + frontend)
├── .env.example                     # Environment template with placeholders only
├── .gitignore                       # Protection against secrets, venv, node_modules, and caches
└── README.md                        # Project overview, quick-start guide, and benchmark tables
```

---

## Model Benchmark Tables (5-Fold Spatial CV)

| Model Architecture | MAE (µg/m³) | RMSE (µg/m³) | R² Score | Spatial Bias |
| :--- | :--- | :--- | :--- | :--- |
| **AeroGrid Spatial Random Forest** | **1.42** | **7.29** | **0.951** | **+0.82** |
| Nearest Station Baseline | 1.21 | 7.24 | 0.948 | +1.07 |
| Inverse Distance Weighting (IDW) | 5.69 | 9.62 | 0.884 | -1.02 |

---

## Quick-Start Guide

### 1. Run with Docker Compose
```bash
docker-compose up --build
```
- Frontend UI: `http://localhost:5173`
- Backend API Docs: `http://localhost:8000/docs`

### 2. Run Locally (Python 3.12+ & Node.js)
```bash
# Backend
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

### 3. Run Automated CI Test Suite
```bash
pytest backend/tests
```
