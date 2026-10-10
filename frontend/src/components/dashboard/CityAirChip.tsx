import type { CSSProperties } from 'react'
import { useApp } from '../../app/appContext'
import { cityAirSummary } from '../../utils/airSummary'
import { formatConcentration } from '../../utils/formatters'

/** City median of measured readings — also explains the dashboard's ambient tint. */
export function CityAirChip() {
  const { stationList, stations } = useApp()
  const summary = cityAirSummary(stationList)
  if (!summary) return null
  const demo = stations.data?.mode === 'mock' ? ' (demo data)' : ''
  return (
    <span
      className="air-chip"
      style={{ '--band': summary.band.color } as CSSProperties}
      title={`Median of the latest measured readings at ${summary.count} stations${demo}. The dashboard's sky tint follows this band: lighter for cleaner air, darker and hazier for worse air.`}
    >
      <span className="air-chip-dot" aria-hidden="true" />
      <span className="air-chip-label">City median</span>
      <strong>{formatConcentration(summary.median)}</strong>
      <span className="air-chip-unit">µg/m³</span>
      <span className="air-chip-band">{summary.band.label}</span>
    </span>
  )
}
