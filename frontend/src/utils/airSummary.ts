import type { Station } from '../types/api'
import { median } from './geo'
import { bandFor, type ConcentrationBand } from './pm25Bands'

export interface CityAirSummary {
  /** Median of the latest measured readings, µg/m³. */
  median: number
  band: ConcentrationBand
  /** Number of stations with a valid latest reading. */
  count: number
}

/**
 * City-wide summary from measured station readings only — model estimates are
 * never mixed in. Returns null when no station has a valid reading.
 */
export function cityAirSummary(stations: Station[]): CityAirSummary | null {
  const values = stations.map((s) => s.value).filter((v): v is number => v !== null && Number.isFinite(v))
  const m = median(values)
  const band = bandFor(m)
  return m === null || !band ? null : { median: m, band, count: values.length }
}
