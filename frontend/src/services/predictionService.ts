import { config } from '../config'
import type { ApiResult, PredictionResponse } from '../types/api'
import { isValidCoordinate, parsePrediction } from '../utils/validation'
import { ApiError, demoDelay, getJson, wrap } from './api'

export async function fetchPrediction(lat: number, lon: number, cityId: string, signal?: AbortSignal): Promise<ApiResult<PredictionResponse>> {
  if (!isValidCoordinate(lat, lon)) throw new ApiError('config', 'Invalid coordinates: latitude must be −90…90 and longitude −180…180.')
  if (config.dataMode === 'mock') {
    const { demoPrediction } = await import('../data/demoStations')
    await demoDelay(signal, 450)
    return wrap(demoPrediction(lat, lon, cityId), 'mock')
  }
  const qs = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6) })
  return wrap(await getJson(`/api/predict?${qs}`, parsePrediction, { signal }), 'api')
}
