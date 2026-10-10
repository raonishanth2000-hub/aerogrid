import type { HistoryPoint } from '../types/api'
import type { TimeRange } from '../types/app'
import { median } from './geo'
import { parseTime } from './formatters'

export const RANGE_MS: Record<TimeRange, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 24 * 3_600_000,
  '30d': 30 * 24 * 3_600_000,
}

export const RANGE_LABEL: Record<TimeRange, string> = { '24h': '24 hours', '7d': '7 days', '30d': '30 days' }

export interface SeriesPoint {
  t: number
  value: number | null
}

/** Valid, time-sorted points. Points with unparseable timestamps are dropped. */
export function toSeries(history: HistoryPoint[] | null | undefined): SeriesPoint[] {
  return (history ?? [])
    .map((p) => ({ t: parseTime(p.timestamp), value: p.value }))
    .filter((p): p is SeriesPoint => p.t !== null)
    .sort((a, b) => a.t - b.t)
}

export function spanMs(series: SeriesPoint[]): number {
  return series.length > 1 ? series[series.length - 1].t - series[0].t : 0
}

/** A range is offered only when the record extends beyond the next-shorter range. */
export function rangeAvailable(range: TimeRange, span: number): boolean {
  if (range === '24h') return span > 0
  if (range === '7d') return span > RANGE_MS['24h']
  return span > RANGE_MS['7d']
}

export function windowSeries(series: SeriesPoint[], end: number, range: TimeRange): SeriesPoint[] {
  const start = end - RANGE_MS[range]
  return series.filter((p) => p.t >= start && p.t <= end)
}

export function typicalIntervalMs(series: SeriesPoint[]): number | null {
  const gaps: number[] = []
  for (let i = 1; i < series.length; i++) gaps.push(series[i].t - series[i - 1].t)
  return median(gaps)
}

/**
 * Inserts null points where consecutive observations are more than 2.5× the
 * typical interval apart, so charts break the line instead of implying
 * continuous measurement. Returns the number of gaps found.
 */
export function withGapBreaks(series: SeriesPoint[]): { points: SeriesPoint[]; gaps: number } {
  const typical = typicalIntervalMs(series)
  if (!typical) return { points: series, gaps: 0 }
  const out: SeriesPoint[] = []
  let gaps = 0
  for (let i = 0; i < series.length; i++) {
    if (i > 0 && series[i].t - series[i - 1].t > typical * 2.5) {
      out.push({ t: series[i - 1].t + typical, value: null })
      gaps++
    }
    out.push(series[i])
  }
  return { points: out, gaps }
}

export interface SeriesStats {
  count: number
  missing: number
  mean: number | null
  min: number | null
  max: number | null
  start: number | null
  end: number | null
}

/** Descriptive statistics computed only from the records passed in. */
export function seriesStats(series: SeriesPoint[]): SeriesStats {
  const values = series.map((p) => p.value).filter((v): v is number => v !== null && Number.isFinite(v))
  return {
    count: values.length,
    missing: series.length - values.length,
    mean: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
    min: values.length ? Math.min(...values) : null,
    max: values.length ? Math.max(...values) : null,
    start: series.length ? series[0].t : null,
    end: series.length ? series[series.length - 1].t : null,
  }
}
