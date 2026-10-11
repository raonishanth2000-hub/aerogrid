# AeroGrid: hyperlocal PM2.5 estimation

AeroGrid estimates PM2.5 at places without a monitoring station. It combines nearby station values,
weather, road and time features in a gradient-boosting model. The project has three parts:

- a FastAPI backend with the ML pipeline;
- a React dashboard;
- AWS deployment configuration.

**Status (Delhi, PM2.5).** The station data is CAMS model output, not sensor measurements. See
[docs/data-sources.md](docs/data-sources.md).

On station-held-out cross-validation:

| Method | MAE (µg/m³) |
| --- | --- |
| AeroGrid model | 3.03 |
| Copying the nearest station | 1.50 |
| IDW | 3.19 |

On real Bengaluru sensor data the model is the best method, but only about 2% better than IDW.
Full results are in [docs/model-evaluation.md](docs/model-evaluation.md). Estimates are labelled as
estimates, and modelled station values as modelled.

## Layout

```
aerogrid/            Python package: API (api.py), data fetch, features, road features (geo.py),
                     training (train.py), spatial cross-validation (experiments.py), prediction, AWS helpers
models/              Trained model, training metrics, cross-validation results (pm25_validation.json)
  archive/bengaluru/ Model and results from real Bengaluru sensor data
data/                training_dataset.csv (Delhi CAMS), bengaluru_openaq_2025.csv (real sensors),
                     stations.json, ingest.py (Open-Meteo ingestion)
frontend/            React + TypeScript + Vite dashboard (see frontend/README.md)
tests/               pytest suite for the API and helpers
ml/                  Experimental pipeline from a teammate; not used and does not run (see ml/README.md)
aws/, buildspec*.yml, appspec*.yaml, taskdef.json   CodeBuild / CodeDeploy / ECS configuration
docs/                API contract, data sources, model evaluation, deployment (see docs/README.md)
```

## Run locally

Backend (Python 3.12+):

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/uvicorn aerogrid.api:app --port 8000
```

Frontend, in a second terminal:

```bash
cd frontend && npm install && npm run dev
```

Open http://localhost:5173 and pick **AeroGrid model** in the top bar.
- **Demo data** shows clearly labelled sample data, with no backend needed.
- **AeroGrid model** uses the live backend.

Or run both with Docker: `docker compose up --build`. This serves the frontend on port 5173 and the
API on port 8000.

`scikit-learn` is pinned to 1.6.1 because the saved model only loads with that version.

## API

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | `ok`, or `degraded` with the missing component |
| `GET /api/stations` | Latest value and history per station, labelled `measured` or `modelled`; forecasts excluded |
| `GET /api/predict?lat=&lon=` | Model estimate with a calibrated 90% interval; `422` outside the study area |
| `GET /api/metrics` | Station-held-out cross-validation with baselines |

Details: [docs/api-contract.md](docs/api-contract.md). Only PM2.5 is supported: PM10 was evaluated,
no model beat a constant, and it was removed.

## Train and validate

```bash
cp .env.example .env                                           # settings; never commit .env
python -m aerogrid.fetch_data --start 2025-01-01 --end 2025-12-31   # real sensors via OpenAQ (needs OPENAQ_API_KEY)
python -m aerogrid.train                                       # trains models/pm25_model.joblib
python -m aerogrid.experiments --publish                       # spatial CV, baselines, 90% interval
python -m aerogrid.experiments --save-best                     # replace the model only if a variant beats everything
python -m aerogrid.predict --lat 28.61 --lon 77.21 --datetime 2026-10-11T14:00
```

Set `GEO_OFFLINE=1` to skip slow OpenStreetMap road lookups and use only the cache.

## Tests

```bash
.venv/bin/pytest                                       # backend
cd frontend && npm run typecheck && npm run lint && npm test && npm run build
```

## Limitations

- Delhi values are CAMS model output on a grid of about 40 km. Validation on them shows agreement
  with CAMS, not real-world accuracy.
- With real sensors (Bengaluru), the model only slightly beats IDW. Its estimates are rough guidance,
  not official readings or health advice.
- Each prediction calls Open-Meteo for weather, so the backend needs internet access.

## Amazon Web Services (AWS) Integration

AeroGrid includes native AWS support for cloud storage and managed model training:

### 1. Configure AWS Credentials in `.env`
```env
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_DEFAULT_REGION=ap-south-1
S3_BUCKET_NAME=your-aerogrid-s3-bucket
SAGEMAKER_ROLE_ARN=arn:aws:iam::123456789012:role/AeroGridSageMakerExecutionRole
```

### 2. AWS IAM Management (Verify, Setup Role & Policies)
- **Verify active IAM credentials, Account ID & permissions:**
  ```bash
  python -m aerogrid.aws iam-verify
  ```
- **Automatically create or verify the SageMaker Execution Role:**
  ```bash
  python -m aerogrid.aws iam-setup-role
  ```
  *(Creates `AeroGridSageMakerExecutionRole`, attaches SageMaker trust relationship, managed execution policy, and S3 bucket access).*
- **Print copy-pasteable least-privilege IAM JSON policies:**
  ```bash
  python -m aerogrid.aws iam-policies
  ```

### 3. Amazon S3 Data & Model Syncing
- **Upload datasets to S3:**
  ```bash
  python -m aerogrid.aws s3-upload-data
  ```
- **Upload trained models to S3:**
  ```bash
  python -m aerogrid.aws s3-upload-models
  ```
- **Download models from S3:**
  ```bash
  python -m aerogrid.aws s3-download-models
  ```

### 4. Amazon SageMaker AI Cloud Training
Train on managed AWS compute instances without local hardware load:
- **Submit training job:**
  ```bash
  python -m aerogrid.aws sagemaker-train --pollutant pm25 --instance-type ml.m5.large
  ```
- **Check job status:**
  ```bash
  python -m aerogrid.aws sagemaker-status --job-name <job_name>
  ```
The training job automatically packages code, reads datasets from S3, trains the model in an official AWS Scikit-learn container, and unpacks the resulting model into `models/`.
