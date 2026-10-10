export const UNAVAILABLE = '—'

/** Formats a concentration. Null/undefined/NaN → em dash; a measured 0 stays "0.0". */
export function formatConcentration(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE
  return Math.abs(value) >= 100 ? Math.round(value).toString() : value.toFixed(1)
}

export function formatMetric(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE
  return value.toFixed(digits)
}

export function formatSigned(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(value).toFixed(digits)}`
}

export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return UNAVAILABLE
  return Math.round(value).toLocaleString()
}

export function formatCoordinate(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`
}

export function parseTime(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function formatDateTime(iso: string | number | null | undefined): string {
  const t = typeof iso === 'number' ? iso : parseTime(iso)
  if (t === null) return 'Unavailable'
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(t)
}

export function formatShortDateTime(t: number): string {
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(t)
}

export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
  const t = parseTime(iso)
  if (t === null) return 'Unavailable'
  const min = Math.round((now - t) / 60_000)
  if (min < -1) return 'in the future'
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 48) return `${h} h ago`
  return `${Math.round(h / 24)} d ago`
}

export function formatDuration(ms: number): string {
  const h = ms / 3_600_000
  if (h < 1) return `${Math.round(ms / 60_000)} min`
  if (h < 48) return `${Math.round(h)} h`
  return `${Math.round(h / 24)} days`
}

export function isStale(iso: string | null | undefined, staleAfterMinutes: number, now = Date.now()): boolean {
  const t = parseTime(iso)
  return t === null || now - t > staleAfterMinutes * 60_000
}

export function latestTime(isos: Array<string | null | undefined>): string | null {
  let best: number | null = null
  for (const iso of isos) {
    const t = parseTime(iso)
    if (t !== null && (best === null || t > best)) best = t
  }
  return best === null ? null : new Date(best).toISOString()
}

export function earliestTime(isos: Array<string | null | undefined>): string | null {
  let best: number | null = null
  for (const iso of isos) {
    const t = parseTime(iso)
    if (t !== null && (best === null || t < best)) best = t
  }
  return best === null ? null : new Date(best).toISOString()
}

export function stationLabel(s: { name: string | null; id: string }): string {
  return s.name ?? `Station ${s.id}`
}

/** "10 Oct, 08:30 – 14:30 GMT+5:30", collapsing the date when both ends fall on the same day. */
export function formatPeriod(startIso: string | null, endIso: string | null): string {
  const start = parseTime(startIso)
  const end = parseTime(endIso)
  if (start === null || end === null) return 'Unavailable'
  const day = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })
  const time = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' })
  const zone = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(end).find((p) => p.type === 'timeZoneName')?.value ?? ''
  if (start === end) return `${day.format(end)}, ${time.format(end)} ${zone}`.trim()
  return day.format(start) === day.format(end)
    ? `${day.format(end)}, ${time.format(start)} – ${time.format(end)} ${zone}`.trim()
    : `${day.format(start)} ${time.format(start)} – ${day.format(end)} ${time.format(end)} ${zone}`.trim()
}
