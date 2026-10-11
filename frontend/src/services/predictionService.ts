import type { DataMode } from '../config'
import type { ApiResult, PredictionResponse } from '../types/api'
import { isValidCoordinate, parsePrediction } from '../utils/validation'
import { ApiError, demoDelay, getJson, wrap } from './api'

export async function fetchPrediction(mode: DataMode, lat: number, lon: number, cityId: string, signal?: AbortSignal): Promise<ApiResult<PredictionResponse>> {
  if (!isValidCoordinate(lat, lon)) throw new ApiError('config', 'Invalid coordinates: latitude must be −90…90 and longitude −180…180.')
  if (mode === 'mock') {
    const { demoPrediction } = await import('../data/demoStations')
    await demoDelay(signal, 450)
    return wrap(demoPrediction(lat, lon, cityId), 'mock')
  }
  const qs = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
  // The model fetches weather, elevation and road data per point; a first request can take ~20 s.
  return wrap(await getJson(`/api/predict?${qs}`, parsePrediction, { signal, timeoutMs: 60_000 }), 'api')
}
