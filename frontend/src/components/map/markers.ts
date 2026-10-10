import L from 'leaflet'
import type { Station } from '../../types/api'
import type { Estimate } from '../../types/app'
import { bandColor, bandFor, UNAVAILABLE_COLOR } from '../../utils/pm25Bands'

// Measured stations are solid circles; model estimates are dashed diamonds.
// Each shows its rounded value; unavailable values show a dash on a neutral hatch,
// so state never relies on colour alone.

const DARK_TEXT_BANDS = new Set(['b1', 'b2', 'b3', 'b4'])

function label(value: number | null): string {
  return value === null ? '–' : Math.round(value).toString()
}

function textTone(value: number | null): string {
  const band = bandFor(value)
  return band && DARK_TEXT_BANDS.has(band.key) ? 'is-dark-text' : 'is-light-text'
}

export function stationIcon(station: Station, selected: boolean): L.DivIcon {
  const unavailable = station.value === null
  const cls = ['mk', 'mk-station', textTone(station.value), unavailable && 'is-unavailable', selected && 'is-selected'].filter(Boolean).join(' ')
  return L.divIcon({
    className: 'mk-wrap',
    html: `<span class="${cls}" style="--c:${unavailable ? UNAVAILABLE_COLOR : bandColor(station.value)}"><span class="mk-val">${label(station.value)}</span></span>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

export function estimateIcon(estimate: Estimate, selected: boolean): L.DivIcon {
  const value = estimate.result?.data.value ?? null
  const unavailable = estimate.status !== 'ready' || value === null
  const text = estimate.status === 'loading' ? '…' : estimate.status === 'error' ? '!' : label(value)
  const cls = ['mk', 'mk-estimate', textTone(unavailable ? null : value), `is-${estimate.status}`, unavailable && 'is-unavailable', selected && 'is-selected']
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'mk-wrap',
    html: `<span class="${cls}" style="--c:${unavailable ? UNAVAILABLE_COLOR : bandColor(value)}"><span class="mk-val">${text}</span></span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  })
}
