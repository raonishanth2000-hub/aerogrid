import type { CityInfo } from '../types/api'
import { parseCities } from '../utils/validation'
import { getJson } from './api'

/** Study areas the AeroGrid backend serves (API mode only; demo mode uses the built-in city list). */
export async function fetchCities(signal?: AbortSignal): Promise<CityInfo[]> {
  return getJson('/api/cities', parseCities, { signal, timeoutMs: 8_000 })
}
