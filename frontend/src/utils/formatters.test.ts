import { describe, expect, it } from 'vitest'
import { formatConcentration, formatCoordinate, formatMetric, formatRelative, formatSigned, isStale, latestTime } from './formatters'
import { bandFor } from './pm25Bands'

describe('formatConcentration', () => {
  it('shows an em dash for missing values, never zero', () => {
    expect(formatConcentration(null)).toBe('—')
    expect(formatConcentration(undefined)).toBe('—')
    expect(formatConcentration(Number.NaN)).toBe('—')
  })
  it('keeps a measured zero as a real value', () => {
    expect(formatConcentration(0)).toBe('0.0')
  })
  it('uses one decimal below 100 and integers above', () => {
    expect(formatConcentration(42.345)).toBe('42.3')
    expect(formatConcentration(152.7)).toBe('153')
  })
})

describe('metric formatting', () => {
  it('formats signed bias and missing metrics', () => {
    expect(formatSigned(2.25)).toBe('+2.3')
    expect(formatSigned(-1)).toBe('−1.0')
    expect(formatSigned(null)).toBe('—')
    expect(formatMetric(null)).toBe('—')
  })
  it('formats coordinates with hemispheres', () => {
    expect(formatCoordinate(28.6139, 77.209)).toBe('28.6139° N, 77.2090° E')
    expect(formatCoordinate(-33.9, -70.6)).toBe('33.9000° S, 70.6000° W')
  })
})

describe('time helpers', () => {
  const now = Date.parse('2026-01-01T12:00:00Z')
  it('formats relative times and handles missing ones', () => {
    expect(formatRelative('2026-01-01T11:30:00Z', now)).toBe('30 min ago')
    expect(formatRelative('2026-01-01T09:00:00Z', now)).toBe('3 h ago')
    expect(formatRelative(null, now)).toBe('Unavailable')
  })
  it('treats missing timestamps as stale', () => {
    expect(isStale(null, 60, now)).toBe(true)
    expect(isStale('2026-01-01T11:30:00Z', 60, now)).toBe(false)
    expect(isStale('2026-01-01T10:00:00Z', 60, now)).toBe(true)
  })
  it('picks the latest valid timestamp', () => {
    expect(latestTime([null, 'bad', '2026-01-01T10:00:00Z', '2026-01-01T11:00:00Z'])).toBe('2026-01-01T11:00:00.000Z')
    expect(latestTime([null, undefined])).toBeNull()
  })
})

describe('bandFor', () => {
  it('maps concentrations to CPCB breakpoints', () => {
    expect(bandFor(0)?.label).toBe('Good')
    expect(bandFor(30.4)?.label).toBe('Good')
    expect(bandFor(61)?.label).toBe('Moderate')
    expect(bandFor(300)?.label).toBe('Severe')
  })
  it('returns no band for missing or invalid values', () => {
    expect(bandFor(null)).toBeNull()
    expect(bandFor(-5)).toBeNull()
  })
})
