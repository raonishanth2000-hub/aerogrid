# AeroGrid — Frontend

**Hyperlocal Air Intelligence.** A dashboard for exploring measured PM2.5 and model-based estimates at locations without monitoring stations.

React 19 · TypeScript · Vite · Leaflet / React Leaflet · Recharts · lucide-react. No UI framework or state library.

## Run locally

```bash
cd frontend
npm install
cp .env.example .env.local    # optional; defaults to demo mode in dev
npm run dev                   # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run typecheck` | TypeScript (`tsc -b`) |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests (formatters, response validation, API error handling) |
| `npm run build` | Type-check + production build to `dist/` |

## Environment variables

| Variable | Required | Meaning |
| --- | --- | --- |
| `VITE_DATA_MODE` | no | `mock` (synthetic DEMO data) or `api`. Unset → `mock` in dev, `api` in production builds. |
| `VITE_API_BASE_URL` | in api mode | Backend base URL, no trailing slash. |
| `VITE_DEFAULT_CITY` | no | City id from `CITIES` in `src/config/index.ts` (default `delhi`). |
| `VITE_STALE_AFTER_MINUTES` | no | Age at which observations are flagged stale (default 180). |
| `VITE_TILE_URL`, `VITE_TILE_ATTRIBUTION` | no | Basemap override. Default: Esri dark-grey canvas (keyless). Check provider terms before production traffic. |

`VITE_` variables are public. Never put secrets or AWS credentials in them.

## Data modes

- **mock**: data comes from `src/data/demoStations.ts` and `src/data/demoMetrics.ts`. Sites are labelled "Demo Site A…", not real stations. A DEMO DATA badge appears on everything sourced from them. Mock metrics are all `null`, so the Model Performance page shows its "not available yet" state. A "Preview layout with placeholder numbers" toggle exists only in mock mode, behind a banner saying the numbers are not evaluation results.
- **api**: every request goes to the backend. Failures show error/retry states and **never** fall back to demo data. Missing values stay missing (shown as "—" / "Unavailable", never 0).

## Backend contract

The backend should allow CORS from the frontend origin. Responses are validated at runtime in `src/utils/validation.ts`. Records with invalid IDs or coordinates are skipped and reported in the UI.

Core fields come from the agreed provisional contract. Fields marked *proposed* are optional extensions the UI can use if the backend adds them. The UI works without them and shows "unavailable" instead. Please agree on these with the frontend before adding them.

### `GET /api/health`
```json
{ "status": "ok" }
```
Any status other than `"ok"` is shown as degraded.

### `GET /api/stations`
```json
{
  "stations": [
    {
      "id": "station-example", "name": "Example Station",
      "latitude": 12.9, "longitude": 77.6,
      "pollutant": "PM2.5", "value": null, "unit": "µg/m³",
      "source_type": "measured", "timestamp": null,
      "data_source": "CPCB",
      "history": [{ "timestamp": "2026-01-01T00:00:00Z", "value": 41.2 }]
    }
  ]
}
```
`data_source` and `history` are *proposed*. `history` powers the Air Quality Analytics page; without it that page shows "No historical data available".

### `GET /api/predict?lat={lat}&lon={lon}`
```json
{
  "location": { "name": null, "latitude": 12.9352, "longitude": 77.6245 },
  "pollutant": "PM2.5", "value": null, "unit": "µg/m³",
  "source_type": "estimated", "timestamp": null,
  "uncertainty": null, "model_version": null,
  "observation_timestamp": null
}
```
- `uncertainty`, when supplied, is `{ lower, upper, confidence_level }` or `{ std }`. That shape is *proposed*; please confirm it.
- `observation_timestamp` (*proposed*) is the time of the input observations. The UI shows it separately from `timestamp`, which is when the estimate was generated.
- Coordinates are validated before the request is sent.

### `GET /api/metrics`
```json
{
  "model_name": null, "model_version": null, "evaluation_method": null,
  "sample_count": null, "mae": null, "rmse": null, "bias": null, "r2": null,
  "evaluated_at": null, "training_period": null,
  "baselines": [{ "method": "IDW interpolation", "mae": 0, "rmse": 0, "bias": 0 }],
  "held_out_predictions": [{ "station_name": "…", "actual": 0, "predicted": 0 }]
}
```
- Metrics display only when at least one of `mae`, `rmse`, `bias` or `r2` is non-null.
- `evaluated_at`, `training_period`, `baselines` and `held_out_predictions` are *proposed*.
- Baselines must use the same evaluation split as the model.

Error responses: any non-2xx status. A JSON body with `detail` or `message` is shown to the user. Requests time out after 15 s.

## What still depends on the backend / ML team

- Real stations, predictions and metrics. The app currently runs on demo data in dev.
- Station history, for analytics and comparison.
- Prediction uncertainty, and the time of the input observations.
- Validation metrics, baselines and held-out predictions.
- A coverage / under-monitored-area analysis. The Monitoring Gaps page shows "Coverage analysis pending" and computes only station counts and spacing.
- AWS architecture and dataset attribution for the About page. Edit `src/data/projectInfo.ts`; it is empty rather than guessed.
- Additional cities: add to `CITIES` in `src/config/index.ts` once the backend serves them. Additional pollutants: add to `POLLUTANTS` in the same file.

## Structure

```
src/
  app/          App, AppLayout, navigation + hash router, AppStateProvider (shared state)
  config/       env-driven settings, cities, pollutants
  types/        api.ts (contract), app.ts (UI state types)
  services/     api.ts (fetch, timeout, cancellation, errors) + one module per endpoint
  hooks/        useResource (abortable fetching), useMediaQuery
  data/         DEMO fixtures, illustrative metrics, About-page project facts
  utils/        formatters, validation, PM2.5 bands, geo, time-series helpers (+ tests)
  components/   layout/ common/ dashboard/ map/ analytics/ model/ coverage/ about/
  pages/        Overview, ExploreMap, Analytics, ModelPerformance, MonitoringGaps, About
  styles/       tokens.css, globals.css
```

PM2.5 colour bands use the breakpoints of the CPCB National AQI PM2.5 sub-index, which is defined for 24-hour averages. The UI labels them as concentration bands, not AQI.
