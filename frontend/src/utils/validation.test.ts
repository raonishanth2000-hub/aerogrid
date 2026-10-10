import { describe, expect, it } from 'vitest'
import { hasEvaluationResults, parseCoordinateInput, parseMetrics, parsePrediction, parseStations, ResponseShapeError } from './validation'

describe('parseStations', () => {
  it('keeps valid stations and counts dropped ones', () => {
    const { stations, dropped } = parseStations({
      stations: [
        { id: 'a', name: 'A', latitude: 28.6, longitude: 77.2, pollutant: 'PM2.5', value: 40, unit: 'µg/m³', source_type: 'measured', timestamp: '2026-01-01T00:00:00Z' },
        { id: 'b', name: 'B', latitude: 200, longitude: 77.2, value: 10 },
        { name: 'no id', latitude: 28, longitude: 77 },
      ],
    })
    expect(stations).toHaveLength(1)
    expect(dropped).toBe(2)
  })
  it('keeps a null value as null rather than zero', () => {
    const { stations } = parseStations({ stations: [{ id: 'a', name: null, latitude: 1, longitude: 2, value: null, timestamp: null }] })
    expect(stations[0].value).toBeNull()
    expect(stations[0].timestamp).toBeNull()
  })
  it('rejects a body without a stations array', () => {
    expect(() => parseStations({})).toThrow(ResponseShapeError)
  })
})

describe('parsePrediction', () => {
  const base = { location: { name: null, latitude: 28.6, longitude: 77.2 }, pollutant: 'PM2.5', unit: 'µg/m³', source_type: 'estimated', timestamp: null, model_version: null }
  it('accepts a null estimate and null uncertainty', () => {
    const p = parsePrediction({ ...base, value: null, uncertainty: null })
    expect(p.value).toBeNull()
    expect(p.uncertainty).toBeNull()
  })
  it('rejects a non-numeric value', () => {
    expect(() => parsePrediction({ ...base, value: 'high' })).toThrow(ResponseShapeError)
  })
  it('drops an uncertainty object with no numbers', () => {
    expect(parsePrediction({ ...base, value: 50, uncertainty: { lower: null } }).uncertainty).toBeNull()
  })
})

describe('parseMetrics / hasEvaluationResults', () => {
  it('treats an all-null metrics response as no results', () => {
    const m = parseMetrics({ model_name: null, model_version: null, evaluation_method: null, sample_count: null, mae: null, rmse: null, bias: null, r2: null })
    expect(hasEvaluationResults(m)).toBe(false)
  })
  it('detects reported metrics and filters invalid held-out points', () => {
    const m = parseMetrics({ mae: 12, held_out_predictions: [{ actual: 10, predicted: 12 }, { actual: 'x', predicted: 1 }] })
    expect(hasEvaluationResults(m)).toBe(true)
    expect(m.held_out_predictions).toHaveLength(1)
  })
})

describe('parseCoordinateInput', () => {
  it('parses comma or space separated pairs', () => {
    expect(parseCoordinateInput('28.61, 77.21')).toEqual({ latitude: 28.61, longitude: 77.21 })
    expect(parseCoordinateInput('28.61 77.21')).toEqual({ latitude: 28.61, longitude: 77.21 })
  })
  it('rejects out-of-range or malformed input', () => {
    expect(parseCoordinateInput('95, 77')).toBeNull()
    expect(parseCoordinateInput('delhi')).toBeNull()
  })
})
