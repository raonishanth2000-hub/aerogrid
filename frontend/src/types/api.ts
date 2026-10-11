// Response contracts for the AeroGrid backend.
//
// Core fields follow the provisional contract agreed for the hackathon (see README).
// Fields marked "proposed extension" are optional: the UI works without them and
// shows an "unavailable" state instead. Coordinate with the backend before relying on them.

import type { DataMode } from '../config'

/** One study area from GET /api/cities; each has its own station data and model. */
export interface CityInfo {
  id: string
  name: string
  latitude: number
  longitude: number
  /** Whether the city's station values are sensor measurements or model output (e.g. CAMS). */
  data_kind: 'measured' | 'modelled'
  data_source: string | null
  station_data_available: boolean
  prediction_available: boolean
}

/** GET /api/health */
export interface HealthResponse {
  status: string
}

export interface HistoryPoint {
  timestamp: string
  value: number | null
}

/**
 * One monitoring station. `source_type` says whether `value` is a sensor measurement or a
 * modelled value at the station's location (e.g. CAMS); it is never an AeroGrid estimate.
 */
export interface Station {
  id: string
  name: string | null
  latitude: number
  longitude: number
  pollutant: string
  /** Latest concentration; null when the station has no valid value. */
  value: number | null
  unit: string
  source_type: 'measured' | 'modelled'
  /** ISO-8601 time of the latest observation; null when unknown. */
  timestamp: string | null
  /** Proposed extension: data provider, e.g. "CPCB" or "OpenAQ". */
  data_source?: string | null
  /** Proposed extension: measured history, any order. Enables the analytics page. */
  history?: HistoryPoint[] | null
}

/** GET /api/stations */
export interface StationsResponse {
  stations: Station[]
}

export interface Uncertainty {
  lower?: number | null
  upper?: number | null
  std?: number | null
  /** e.g. 0.9 for a 90% prediction interval. */
  confidence_level?: number | null
}

/** GET /api/predict?lat=&lon= — a model estimate, never a measurement. */
export interface PredictionResponse {
  location: { name: string | null; latitude: number; longitude: number }
  pollutant: string
  value: number | null
  unit: string
  source_type: 'estimated'
  /** When the estimate was generated. */
  timestamp: string | null
  uncertainty: Uncertainty | null
  model_version: string | null
  /** Proposed extension: time of the observations the estimate is based on. */
  observation_timestamp?: string | null
}

export interface BaselineResult {
  method: string
  mae: number | null
  rmse: number | null
  bias?: number | null
  r2?: number | null
}

export interface HeldOutPrediction {
  station_id?: string | null
  station_name?: string | null
  actual: number
  predicted: number
}

/** GET /api/metrics */
export interface MetricsResponse {
  model_name: string | null
  model_version: string | null
  evaluation_method: string | null
  sample_count: number | null
  mae: number | null
  rmse: number | null
  bias: number | null
  r2: number | null
  /** Proposed extension. */
  evaluated_at?: string | null
  /** Proposed extension, e.g. "2024-01-01 – 2024-06-30". */
  training_period?: string | null
  /** Proposed extension: baselines evaluated on the same split. */
  baselines?: BaselineResult[] | null
  /** Proposed extension: held-out station predictions for the actual-vs-predicted plot. */
  held_out_predictions?: HeldOutPrediction[] | null
}

/** A response plus where it came from. */
export interface ApiResult<T> {
  data: T
  mode: DataMode
  receivedAt: string
}
