// Runtime validation of backend responses. Anything that doesn't match the contract
// is rejected or dropped — never patched with made-up values.

import type {
  BaselineResult,
  CityInfo,
  HealthResponse,
  HeldOutPrediction,
  HistoryPoint,
  MetricsResponse,
  PredictionResponse,
  Station,
  Uncertainty,
} from '../types/api'

export class ResponseShapeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResponseShapeError'
  }
}

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const numOrNull = (v: unknown): number | null => (finite(v) ? v : null)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null)

export function isValidLatitude(lat: unknown): lat is number {
  return finite(lat) && lat >= -90 && lat <= 90
}

export function isValidLongitude(lon: unknown): lon is number {
  return finite(lon) && lon >= -180 && lon <= 180
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return isValidLatitude(lat) && isValidLongitude(lon)
}

/** Parses "28.61, 77.21" (or space-separated) into a coordinate pair. */
export function parseCoordinateInput(input: string): { latitude: number; longitude: number } | null {
  const m = input.trim().match(/^(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)$/)
  if (!m) return null
  const latitude = Number(m[1])
  const longitude = Number(m[2])
  return isValidCoordinate(latitude, longitude) ? { latitude, longitude } : null
}

export function parseHealth(body: unknown): HealthResponse {
  if (!isObj(body) || typeof body.status !== 'string') throw new ResponseShapeError('Health response is missing "status".')
  return { status: body.status }
}

/** Study areas served by the backend; entries without an id, name or valid centre are dropped. */
export function parseCities(body: unknown): CityInfo[] {
  if (!isObj(body) || !Array.isArray(body.cities)) throw new ResponseShapeError('Cities response is missing a "cities" array.')
  return body.cities
    .filter((c): c is Obj => isObj(c) && typeof c.id === 'string' && typeof c.name === 'string' && isValidCoordinate(c.latitude, c.longitude))
    .map((c) => ({
      id: (c.id as string).toLowerCase(),
      name: c.name as string,
      latitude: c.latitude as number,
      longitude: c.longitude as number,
      data_kind: c.data_kind === 'measured' ? 'measured' : 'modelled',
      data_source: strOrNull(c.data_source),
      station_data_available: c.station_data_available === true,
      prediction_available: c.prediction_available === true,
    }))
}

function parseHistory(v: unknown): HistoryPoint[] | null {
  if (!Array.isArray(v)) return null
  return v
    .filter((p): p is Obj => isObj(p) && typeof p.timestamp === 'string' && !Number.isNaN(Date.parse(p.timestamp)))
    .map((p) => ({ timestamp: p.timestamp as string, value: numOrNull(p.value) }))
}

/** Returns valid stations plus a count of records dropped for invalid coordinates or ids. */
export function parseStations(body: unknown): { stations: Station[]; dropped: number } {
  if (!isObj(body) || !Array.isArray(body.stations)) throw new ResponseShapeError('Stations response is missing a "stations" array.')
  const stations: Station[] = []
  let dropped = 0
  for (const s of body.stations) {
    if (!isObj(s) || typeof s.id !== 'string' || !isValidCoordinate(s.latitude, s.longitude)) {
      dropped++
      continue
    }
    stations.push({
      id: s.id,
      name: strOrNull(s.name),
      latitude: s.latitude as number,
      longitude: s.longitude as number,
      pollutant: strOrNull(s.pollutant) ?? 'PM2.5',
      value: numOrNull(s.value),
      unit: strOrNull(s.unit) ?? 'µg/m³',
      source_type: s.source_type === 'modelled' ? 'modelled' : 'measured',
      timestamp: strOrNull(s.timestamp),
      data_source: strOrNull(s.data_source),
      history: parseHistory(s.history),
    })
  }
  return { stations, dropped }
}

function parseUncertainty(v: unknown): Uncertainty | null {
  if (!isObj(v)) return null
  const u: Uncertainty = {
    lower: numOrNull(v.lower),
    upper: numOrNull(v.upper),
    std: numOrNull(v.std),
    confidence_level: numOrNull(v.confidence_level),
  }
  return u.lower !== null || u.upper !== null || u.std !== null ? u : null
}

export function parsePrediction(body: unknown): PredictionResponse {
  if (!isObj(body) || !isObj(body.location)) throw new ResponseShapeError('Prediction response is missing "location".')
  const loc = body.location
  if (!isValidCoordinate(loc.latitude, loc.longitude)) throw new ResponseShapeError('Prediction response has invalid coordinates.')
  if (body.value !== null && body.value !== undefined && !finite(body.value)) {
    throw new ResponseShapeError('Prediction "value" must be a number or null.')
  }
  return {
    location: { name: strOrNull(loc.name), latitude: loc.latitude as number, longitude: loc.longitude as number },
    pollutant: strOrNull(body.pollutant) ?? 'PM2.5',
    value: numOrNull(body.value),
    unit: strOrNull(body.unit) ?? 'µg/m³',
    source_type: 'estimated',
    timestamp: strOrNull(body.timestamp),
    uncertainty: parseUncertainty(body.uncertainty),
    model_version: strOrNull(body.model_version),
    observation_timestamp: strOrNull(body.observation_timestamp),
  }
}

export function parseMetrics(body: unknown): MetricsResponse {
  if (!isObj(body)) throw new ResponseShapeError('Metrics response is not an object.')
  const baselines: BaselineResult[] | null = Array.isArray(body.baselines)
    ? body.baselines
        .filter((b): b is Obj => isObj(b) && typeof b.method === 'string')
        .map((b) => ({ method: b.method as string, mae: numOrNull(b.mae), rmse: numOrNull(b.rmse), bias: numOrNull(b.bias), r2: numOrNull(b.r2) }))
    : null
  const heldOut: HeldOutPrediction[] | null = Array.isArray(body.held_out_predictions)
    ? body.held_out_predictions
        .filter((p): p is Obj => isObj(p) && finite(p.actual) && finite(p.predicted))
        .map((p) => ({
          station_id: strOrNull(p.station_id),
          station_name: strOrNull(p.station_name),
          actual: p.actual as number,
          predicted: p.predicted as number,
        }))
    : null
  return {
    model_name: strOrNull(body.model_name),
    model_version: strOrNull(body.model_version),
    evaluation_method: strOrNull(body.evaluation_method),
    sample_count: numOrNull(body.sample_count),
    mae: numOrNull(body.mae),
    rmse: numOrNull(body.rmse),
    bias: numOrNull(body.bias),
    r2: numOrNull(body.r2),
    evaluated_at: strOrNull(body.evaluated_at),
    training_period: strOrNull(body.training_period),
    baselines,
    held_out_predictions: heldOut,
  }
}

/** True when the backend has reported at least one evaluation metric. */
export function hasEvaluationResults(m: MetricsResponse | undefined): m is MetricsResponse {
  return !!m && [m.mae, m.rmse, m.bias, m.r2].some((v) => v !== null)
}
