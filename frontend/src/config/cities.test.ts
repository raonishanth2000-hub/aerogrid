import { describe, expect, it } from 'vitest'
import { parseCities } from '../utils/validation'
import { availableCities, CITIES, config } from './index'

describe('parseCities', () => {
  it('keeps valid cities and defaults unknown kinds to modelled', () => {
    const cities = parseCities({
      cities: [
        { id: 'Bengaluru', name: 'Bengaluru', latitude: 12.97, longitude: 77.59, data_kind: 'measured', prediction_available: true },
        { id: 'x', name: 'Bad', latitude: 999, longitude: 0 },
        { id: 'pune', name: 'Pune', latitude: 18.52, longitude: 73.86, data_kind: 'something' },
      ],
    })
    expect(cities.map((c) => c.id)).toEqual(['bengaluru', 'pune'])
    expect(cities[0]).toMatchObject({ data_kind: 'measured', prediction_available: true, station_data_available: false })
    expect(cities[1].data_kind).toBe('modelled')
  })

  it('rejects a body without a cities array', () => {
    expect(() => parseCities({})).toThrow()
  })
})

describe('availableCities', () => {
  it('offers every demo city in mock mode', () => {
    expect(availableCities('mock')).toEqual(CITIES)
  })

  it('offers only the default city in API mode until the backend list arrives', () => {
    expect(availableCities('api').map((c) => c.id)).toEqual([config.defaultCityId])
  })

  it('offers the cities the backend serves, framing unknown ones from their centre', () => {
    const ids = availableCities('api', [
      { id: 'bengaluru', name: 'Bengaluru', latitude: 12.97, longitude: 77.59 },
      { id: 'pune', name: 'Pune', latitude: 18.52, longitude: 73.86 },
    ])
    expect(ids.map((c) => c.id)).toEqual(['bengaluru', 'pune'])
    expect(ids[1].center).toEqual([18.52, 73.86])
  })
})
