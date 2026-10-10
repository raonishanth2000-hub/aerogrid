import { describe, expect, it } from 'vitest'
import type { Station } from '../types/api'
import { cityAirSummary } from './airSummary'

const station = (id: string, value: number | null): Station => ({
  id,
  name: id,
  latitude: 28.6,
  longitude: 77.2,
  pollutant: 'PM2.5',
  value,
  unit: 'µg/m³',
  source_type: 'measured',
  timestamp: null,
})

describe('cityAirSummary', () => {
  it('uses the median of valid readings and ignores missing ones', () => {
    const s = cityAirSummary([station('a', 20), station('b', null), station('c', 100), station('d', 70)])
    expect(s?.median).toBe(70)
    expect(s?.count).toBe(3)
    expect(s?.band.label).toBe('Moderate')
  })
  it('returns null when no station has a reading', () => {
    expect(cityAirSummary([station('a', null)])).toBeNull()
    expect(cityAirSummary([])).toBeNull()
  })
})
