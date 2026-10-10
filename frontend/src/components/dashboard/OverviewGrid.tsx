import { Clock3, Crosshair, Diamond, RadioTower } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'
import { useApp } from '../../app/appContext'
import { config } from '../../config'
import { formatConcentration, formatDateTime, formatRelative, formatShortDateTime, isStale, stationLabel } from '../../utils/formatters'
import { cityAirSummary } from '../../utils/airSummary'
import { bandFor } from '../../utils/pm25Bands'
import { toSeries, windowSeries } from '../../utils/series'
import { ScaleBar } from '../common/ScaleBar'
import { Sparkline } from '../common/Sparkline'
import { ModeBadge, SourceBadge } from '../common/StatusBadge'
import { BandDistribution } from './BandDistribution'
import { MetricCard } from './MetricCard'

export function OverviewGrid() {
  const { stations, stationList, estimates, selectedStation, selectedEstimate, latestObservation } = useApp()
  const loading = stations.status === 'loading' && !stations.data
  const unavailable = !stations.data && stations.status === 'error'
  const reporting = stationList.filter((s) => s.value !== null).length
  const validEstimates = estimates.filter((e) => e.status === 'ready' && e.result?.data.value !== null)
  const estimatesMode = validEstimates[0]?.result?.mode

  // Selected location — falls back to the measured city median when nothing is selected.
  const summary = cityAirSummary(stationList)
  let selLabel = 'Selected area PM2.5'
  let selValue: number | null = null
  let selDisplay: ReactNode = '—'
  let selUnit: string | undefined
  let selDesc: ReactNode = 'Select a station or click anywhere on the map'
  let selBadges: ReactNode = null
  let spark: ReactNode = null
  if (!selectedStation && !selectedEstimate && summary) {
    selLabel = 'City median PM2.5'
    selValue = summary.median
    selDisplay = formatConcentration(summary.median)
    selUnit = 'µg/m³'
    selDesc = (
      <>
        <SourceBadge kind="measured" /> median of {summary.count} stations
      </>
    )
    selBadges = <ModeBadge mode={stations.data?.mode} />
  }
  if (selectedStation) {
    selValue = selectedStation.value
    selDisplay = formatConcentration(selValue)
    selUnit = selValue !== null ? selectedStation.unit : undefined
    selDesc = (
      <>
        <SourceBadge kind="measured" /> {stationLabel(selectedStation)}
      </>
    )
    selBadges = <ModeBadge mode={stations.data?.mode} />
    const series = toSeries(selectedStation.history)
    const last = series.at(-1)
    if (last) spark = <Sparkline points={windowSeries(series, last.t, '24h')} width={104} height={34} />
  } else if (selectedEstimate) {
    const r = selectedEstimate.result
    selValue = r?.data.value ?? null
    selDisplay =
      selectedEstimate.status === 'loading' ? (
        <span className="muted small-num">Estimating…</span>
      ) : selectedEstimate.status === 'error' ? (
        <span className="warn-text small-num">Failed</span>
      ) : (
        formatConcentration(selValue)
      )
    selUnit = selValue !== null ? r?.data.unit : undefined
    selDesc = (
      <>
        <SourceBadge kind="estimated" /> {selectedEstimate.latitude.toFixed(3)}, {selectedEstimate.longitude.toFixed(3)}
      </>
    )
    selBadges = <ModeBadge mode={r?.mode} />
  }
  const band = bandFor(selValue)
  const stale = latestObservation ? isStale(latestObservation, config.staleAfterMinutes) : false

  return (
    <div className="overview-grid" role="group" aria-label="Summary metrics">
      <MetricCard
        emphasis
        icon={Crosshair}
        label={selLabel}
        value={
          <>
            {selDisplay}
            {selUnit && <span className="metric-unit">{selUnit}</span>}
            {band && (
              <span className="band-chip" style={{ '--band': band.color } as CSSProperties}>
                {band.label}
              </span>
            )}
          </>
        }
        aside={spark && <span title="Last 24 h of measurements at this station">{spark}</span>}
        visual={<ScaleBar value={selValue} />}
        description={selDesc}
        badges={selBadges}
        info="With nothing selected: the median of the latest measured station readings. Otherwise the selected station (measured) or map point (model estimate). Bands use CPCB 24-hour breakpoints and are indicative for shorter averaging periods."
      />
      <MetricCard
        icon={RadioTower}
        label="Monitoring stations"
        loading={loading}
        value={unavailable ? '—' : stationList.length}
        visual={<BandDistribution stations={stationList} />}
        description={unavailable ? 'Station data unavailable' : `${reporting} reporting · ${stationList.length - reporting} no data`}
        badges={<ModeBadge mode={stations.data?.mode} />}
        info="Stations returned by the API with valid coordinates. The bar shows how their latest measured readings fall across concentration bands."
      />
      <MetricCard
        icon={Diamond}
        label="Estimates"
        value={validEstimates.length}
        description={validEstimates.length ? 'Valid, this session' : 'Click the map'}
        badges={<ModeBadge mode={estimatesMode} />}
        info="Points where the model returned a numeric estimate during this session. Failed or empty predictions are not counted."
      />
      <MetricCard
        icon={Clock3}
        label="Latest observation"
        loading={loading}
        value={
          latestObservation ? (
            <>
              <span className={`fresh-dot ${stale ? 'is-stale' : ''}`} aria-hidden="true" />
              {formatRelative(latestObservation)}
            </>
          ) : (
            '—'
          )
        }
        description={
          latestObservation ? (
            <span title={formatDateTime(latestObservation)} className={stale ? 'warn-text' : undefined}>
              {stale ? 'Stale · ' : ''}
              {formatShortDateTime(Date.parse(latestObservation))}
            </span>
          ) : unavailable ? (
            'Station data unavailable'
          ) : (
            'No timestamped observations'
          )
        }
        info={`Timestamp of the newest station observation in the current data. Data older than ${Math.round(config.staleAfterMinutes / 60)} h is flagged as stale.`}
      />
    </div>
  )
}
