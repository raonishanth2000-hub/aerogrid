import L from 'leaflet'
import type { Station } from '../../types/api'
import type { Estimate } from '../../types/app'
import { bandColor, UNAVAILABLE_COLOR } from '../../utils/pm25Bands'

// Measured stations are solid circles; model estimates are dashed diamonds.
// Unavailable values use a neutral hatched fill, so state never relies on colour alone.

const SIZE = 24

export function stationIcon(station: Station, selected: boolean): L.DivIcon {
  const unavailable = station.value === null
  const cls = ['mk', 'mk-station', unavailable && 'is-unavailable', selected && 'is-selected'].filter(Boolean).join(' ')
  return L.divIcon({
    className: 'mk-wrap',
    html: `<span class="${cls}" style="--c:${unavailable ? UNAVAILABLE_COLOR : bandColor(station.value)}"></span>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
  })
}

export function estimateIcon(estimate: Estimate, selected: boolean): L.DivIcon {
  const value = estimate.result?.data.value ?? null
  const unavailable = estimate.status !== 'ready' || value === null
  const cls = ['mk', 'mk-estimate', `is-${estimate.status}`, unavailable && 'is-unavailable', selected && 'is-selected']
    .filter(Boolean)
    .join(' ')
  return L.divIcon({
    className: 'mk-wrap',
    html: `<span class="${cls}" style="--c:${unavailable ? UNAVAILABLE_COLOR : bandColor(value)}"></span>`,
    iconSize: [SIZE, SIZE],
    iconAnchor: [SIZE / 2, SIZE / 2],
  })
}
