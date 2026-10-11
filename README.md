# AeroGrid — Antigravity starter project

A beginner-friendly research prototype for estimating PM2.5/PM10 at an unmonitored coordinate using real monitoring observations, weather and geographic/time features.

**This is a working code scaffold, not a claim that a city-specific model has already been trained.** You must download real observations, train it and inspect the measured validation metrics before relying on results. Coverage in the selected area may be too sparse for a valid model.

## What the first version does

1. Downloads hourly PM2.5/PM10 observations from OpenAQ in a radius around a configurable study-area centre.
2. Downloads historical weather from Open-Meteo for each station location and joins it to the hourly observations.
3. Trains a Random Forest regression model using coordinates, weather, time features and same-time readings from nearby stations.
4. Evaluates on monitoring locations held out from training when at least four locations are available. With fewer locations it clearly marks validation as weaker.
5. Lets you enter a target latitude/longitude and local date/time, then predicts a pollutant estimate using weather at that location.
6. Shows a separate IDW interpolation estimate if suitable readings within ±3 hours exist in the downloaded dataset.
7. Displays station locations and model validation metrics in a Streamlit map UI.

The model does not yet include roads/building density or satellite aerosol data. Add these after the baseline runs end-to-end. The first version is meant to establish a reproducible baseline rather than overstate spatial accuracy.

## Data sources and credentials

- OpenAQ API v3 provides air-quality observations and requires an API key. Sign up at https://explore.openaq.org/register and see https://docs.openaq.org/using-the-api/api-key.
- Open-Meteo historical weather API: https://open-meteo.com/en/docs/historical-weather-api.

Review the license/attribution of each source and confirm coverage for your city. The code skips unsupported PM concentration units rather than silently combining units.

## 1. Open the project in Google Antigravity

1. Download/extract this folder.
2. Open Antigravity IDE.
3. Create a project and choose **Add Folder** (or open an existing folder) and select the `aerogrid_antigravity` folder.
4. Use the prompts in `ANTIGRAVITY_PROMPTS.md` one at a time. Ask the agent to explain each command before running it. Inspect changes and error output rather than accepting a rewrite of the whole project.

Official Antigravity guide: https://www.antigravity.google/docs/ide/overview/

## 2. Create the Python environment

macOS / Linux terminal, from this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Windows PowerShell:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Check the local helper logic without accessing the network:

```bash
python -m unittest discover -s tests -v
```

## 3. Add the OpenAQ key

Copy `.env.example` to `.env`, then replace the placeholder with your private OpenAQ key. Do not upload `.env`, show the key in screenshots, or commit it to GitHub.

macOS / Linux:

```bash
cp .env.example .env
```

Set the study-area centre and timezone in `.env`. Bengaluru coordinates and `Asia/Kolkata` are defaults; replace them for another city. OpenAQ's radius search supports at most 25 km, so change the centre/radius if needed.

## 4. Download observations + weather

Start with about six months; extend the period if there are too few readings or the data is not seasonally representative.

```bash
python -m aerogrid.fetch_data --start 2025-10-01 --end 2026-09-30
```

Use dates that are actually covered by the upstream stations. The example command is only an example date range; inspect the available data summary from the fetch script. The default if no dates are provided is 180 days ending seven days ago.

The script writes:

- `data/raw_observations.csv` — downloaded station readings before weather join.
- `data/training_dataset.csv` — station-hour PM readings joined with weather features.

If it reports no PM sensors, no observations, or insufficient locations, do not fabricate rows. Try another date range or area and inspect OpenAQ coverage first.

## 5. Train the ML model

Train PM2.5 first:

```bash
python -m aerogrid.train --pollutant pm25
```

Optionally train PM10 if the dataset has sufficient PM10 records:

```bash
python -m aerogrid.train --pollutant pm10
```

The script prints MAE, RMSE, bias, R² and a median baseline. It saves a model in `models/pm25_model.joblib` or `models/pm10_model.joblib`, metrics JSON under `models/`, and held-out predictions under `data/`.

**How to read validation:**

- MAE and RMSE are error in µg/m³; lower is better.
- Bias above zero means the model overestimates on average; below zero means it underestimates.
- Compare model MAE with `training_median_baseline_mae_ugm3`; a model that does not beat the baseline has not shown useful improvement.
- If fewer than four stations are available, the code cannot provide a strong spatial holdout; treat model outputs as experimental.

## 6. Run the web app

```bash
streamlit run app.py
```

The browser dashboard allows you to:

1. Select PM2.5 or PM10.
2. Enter a target latitude/longitude for a location without a station.
3. Choose local date/time.
4. Click **Estimate pollution at this location**.
5. View the model estimate, holdout metrics, weather features and an optional IDW comparison from nearby downloaded readings.

The model calls Open-Meteo at prediction time, so the computer running the app needs internet access. The selected timestamp must have historical weather data or fall inside the forecast provider's supported period.

## 7. Command-line prediction

After training a model:

```bash
python -m aerogrid.predict --pollutant pm25 --lat 12.9352 --lon 77.6245 --datetime 2026-10-10T14:00
```

Replace the example coordinates/date with the target and chosen local time. This prints JSON with the ML estimate and, when available, a separate IDW estimate.

## Model approach

Version 1 uses Random Forest regression with:

- latitude and longitude;
- temperature, relative humidity, wind speed, wind direction and pressure;
- cyclic time-of-day, day-of-year and day-of-week features;
- same-time nearby PM measurements, a distance-weighted neighbour estimate, nearest/second-nearest station values, nearest distance and neighbour count.

It uses real PM observations as target labels. It does not claim to measure air at an unmonitored point. Even with neighbour readings, these features may be insufficient for reliable hyperlocal estimates when station coverage is low or inputs are stale. The optional IDW output is shown as a separate comparator and is not blended into the ML result.

## Recommended upgrades after the first end-to-end run

1. **Live data refresh:** add a safe, rate-limited refresh of the latest station observations before prediction; verify timestamps and reject stale values.
2. **Geography:** calculate road density, distance to major roads, land use and elevation using licensed geographic datasets or OpenStreetMap data.
3. **Satellite:** add aerosol optical depth/other satellite-derived features only after learning temporal/spatial matching and validating against ground-level measurements. Satellite aerosol is not the same as ground-level PM2.5.
4. **Uncertainty:** calibrate prediction intervals on held-out residuals, and show low-coverage zones clearly.
5. **AWS hosting:** after local validation, move files to S3 and schedule ingestion/training/inference. Avoid running always-on services until needed.

## Important limitations

- OpenAQ coverage may be sparse or unavailable around the study-area centre.
- OpenAQ data may include different instrument types and data providers. Inspect station metadata and licensing.
- The current model uses nearby measurements from the downloaded dataset when observations exist close to the selected timestamp. It does not yet poll the latest OpenAQ values live at inference time, and it does not include road density or satellite variables. The separate IDW comparator is shown alongside the ML result and is not blended into it.
- Forecast-day predictions can be less reliable because they use forecast weather and historical relationships.
- Do not describe an estimate as an official CPCB/AQICN-style reading or as an emergency/health diagnostic.
- A visually smooth map does not prove fine-scale accuracy. Report results only from held-out real measurements.

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
