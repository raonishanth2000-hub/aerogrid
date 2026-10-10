import { config } from '../config'
import type { ApiResult, StationsResponse } from '../types/api'
import { parseStations } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export interface StationsResult extends StationsResponse {
  /** Records dropped because of invalid ids or coordinates. */
  dropped: number
}

/** `cityId` selects demo fixtures; the API contract has no city parameter yet, so it is not sent. */
export async function fetchStations(cityId: string, signal?: AbortSignal): Promise<ApiResult<StationsResult>> {
  if (config.dataMode === 'mock') {
    const { demoStations } = await import('../data/demoStations')
    await demoDelay(signal)
    return wrap({ stations: demoStations(cityId), dropped: 0 }, 'mock')
  }
  return wrap(await getJson('/api/stations', parseStations, { signal }), 'api')
}
