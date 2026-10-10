import { config } from '../config'
import type { ApiResult, StationsResponse } from '../types/api'
import { parseStations } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export interface StationsResult extends StationsResponse {
  /** Records dropped because of invalid ids or coordinates. */
  dropped: number
}

export async function fetchStations(signal?: AbortSignal): Promise<ApiResult<StationsResult>> {
  if (config.dataMode === 'mock') {
    const { demoStations } = await import('../data/demoStations')
    await demoDelay(signal)
    return wrap({ stations: demoStations(), dropped: 0 }, 'mock')
  }
  return wrap(await getJson('/api/stations', parseStations, { signal }), 'api')
}
