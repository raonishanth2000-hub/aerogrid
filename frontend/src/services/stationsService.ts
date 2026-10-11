import type { DataMode } from '../config'
import type { ApiResult, StationsResponse } from '../types/api'
import { parseStations } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export interface StationsResult extends StationsResponse {
  /** Records dropped because of invalid ids or coordinates. */
  dropped: number
}

/** `cityId` selects the demo fixtures or, in API mode, the backend study area. */
export async function fetchStations(mode: DataMode, cityId: string, signal?: AbortSignal): Promise<ApiResult<StationsResult>> {
  if (mode === 'mock') {
    const { demoStations } = await import('../data/demoStations')
    await demoDelay(signal)
    return wrap({ stations: demoStations(cityId), dropped: 0 }, 'mock')
  }
  return wrap(await getJson(`/api/stations?${new URLSearchParams({ city: cityId })}`, parseStations, { signal }), 'api')
}
