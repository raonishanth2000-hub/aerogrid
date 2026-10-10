// PM2.5 concentration bands.
//
// Breakpoints are taken from the PM2.5 sub-index of India's National Air Quality Index
// (CPCB, 2014), which is defined on 24-hour average concentrations. AeroGrid shows
// concentrations, not AQI values: these bands only group concentrations for colour coding,
// and an hourly reading in a band is indicative, not an official AQI category.

export interface ConcentrationBand {
  key: string
  label: string
  min: number
  /** Inclusive upper bound; Infinity for the top band. */
  max: number
  color: string
}

export const PM25_BANDS: ConcentrationBand[] = [
  { key: 'b1', label: 'Good', min: 0, max: 30, color: 'var(--band-1)' },
  { key: 'b2', label: 'Satisfactory', min: 31, max: 60, color: 'var(--band-2)' },
  { key: 'b3', label: 'Moderate', min: 61, max: 90, color: 'var(--band-3)' },
  { key: 'b4', label: 'Poor', min: 91, max: 120, color: 'var(--band-4)' },
  { key: 'b5', label: 'Very poor', min: 121, max: 250, color: 'var(--band-5)' },
  { key: 'b6', label: 'Severe', min: 251, max: Infinity, color: 'var(--band-6)' },
]

export const BAND_SOURCE =
  'Breakpoints from the PM2.5 sub-index of India’s National AQI (CPCB), defined for 24-hour averages. Values shown are concentrations, not AQI.'

export const UNAVAILABLE_COLOR = 'var(--band-none)'

/** India NAAQS 24-hour PM2.5 standard, µg/m³. */
export const NAAQS_24H_PM25 = 60

export function bandFor(value: number | null | undefined): ConcentrationBand | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value < 0) return null
  const v = Math.round(value)
  return PM25_BANDS.find((b) => v <= b.max) ?? PM25_BANDS[PM25_BANDS.length - 1]
}

/** Band key for filtering; 'none' when the value is unavailable. */
export function bandKey(value: number | null | undefined): string {
  return bandFor(value)?.key ?? 'none'
}

export function bandColor(value: number | null | undefined): string {
  return bandFor(value)?.color ?? UNAVAILABLE_COLOR
}

export function bandRangeLabel(b: ConcentrationBand): string {
  return Number.isFinite(b.max) ? `${b.min}–${b.max}` : `${b.min}+`
}

/** Position (0–1) of a concentration on an equal-width band scale. */
export function scalePosition(value: number): number {
  const band = bandFor(value)
  if (!band) return 0
  const i = PM25_BANDS.indexOf(band)
  const lo = i === 0 ? 0 : PM25_BANDS[i - 1].max
  const hi = Number.isFinite(band.max) ? band.max : band.min + 250
  const frac = Math.min(Math.max((value - lo) / (hi - lo), 0), 1)
  return (i + frac) / PM25_BANDS.length
}
