import type { ReactNode } from 'react'
import type { CSSProperties } from 'react'
import { useApp } from '../../app/appContext'
import { config } from '../../config'
import { formatConcentration, formatDateTime, formatRelative, isStale, stationLabel } from '../../utils/formatters'
import { bandFor } from '../../utils/pm25Bands'
import { ModeBadge, SourceBadge } from '../common/StatusBadge'
import { MetricCard } from './MetricCard'

export function OverviewGrid() {
  const { stations, stationList, estimates, selectedStation, selectedEstimate, latestObservation } = useApp()
  const loading = stations.status === 'loading' && !stations.data
  const unavailable = !stations.data && stations.status === 'error'
  const reporting = stationList.filter((s) => s.value !== null).length
  const validEstimates = estimates.filter((e) => e.status === 'ready' && e.result?.data.value !== null)
  const estimatesMode = validEstimates[0]?.result?.mode

  // Selected area
  let selValue: number | null = null
  let selDesc: ReactNode = 'Select a station or click the map'
  let selBadges: ReactNode = null
  let selDisplay: ReactNode = '—'
  let selUnit: string | undefined
  if (selectedStation) {
    selValue = selectedStation.value
    selDisplay = formatConcentration(selValue)
    selUnit = selValue !== null ? selectedStation.unit : undefined
    selDesc = stationLabel(selectedStation)
    selBadges = (
      <>
        <SourceBadge kind="measured" />
        <ModeBadge mode={stations.data?.mode} />
      </>
    )
  } else if (selectedEstimate) {
    const r = selectedEstimate.result
    selValue = r?.data.value ?? null
    selDisplay =
      selectedEstimate.status === 'loading' ? <span className="muted small-num">Estimating…</span> : selectedEstimate.status === 'error' ? <span className="warn-text small-num">Failed</span> : formatConcentration(selValue)
    selUnit = selValue !== null ? r?.data.unit : undefined
    selDesc = `${selectedEstimate.latitude.toFixed(3)}, ${selectedEstimate.longitude.toFixed(3)}`
    selBadges = (
      <>
        <SourceBadge kind="estimated" />
        <ModeBadge mode={r?.mode} />
      </>
    )
  }
  const band = bandFor(selValue)

  return (
    <div className="overview-grid" role="group" aria-label="Summary metrics">
      <MetricCard
        emphasis
        label="Selected area PM2.5"
        value={
          <>
            {selDisplay}
            {band && (
              <span className="band-chip" style={{ '--band': band.color } as CSSProperties}>
                {band.label} band
              </span>
            )}
          </>
        }
        unit={selUnit}
        description={selDesc}
        badges={selBadges}
        info="Concentration at the selected station (measured) or map point (model estimate). Bands use CPCB 24-hour breakpoints and are indicative for shorter averaging periods."
      />
      <MetricCard
        label="Monitoring stations"
        loading={loading}
        value={unavailable ? '—' : stationList.length}
        description={
          unavailable ? 'Station data unavailable' : `${reporting} with a valid latest reading`
        }
        badges={<ModeBadge mode={stations.data?.mode} />}
        info="Stations returned by the API with valid coordinates. Stations without a valid latest reading are shown with a neutral marker."
      />
      <MetricCard
        label="Locations with valid estimates"
        value={validEstimates.length}
        description={validEstimates.length ? 'Requested this session' : 'Click the map to request one'}
        badges={<ModeBadge mode={estimatesMode} />}
        info="Points where the model returned a numeric estimate during this session. Failed or empty predictions are not counted."
      />
      <MetricCard
        label="Latest observation"
        loading={loading}
        value={latestObservation ? formatRelative(latestObservation) : '—'}
        description={
          latestObservation ? (
            isStale(latestObservation, config.staleAfterMinutes) ? (
              <span className="warn-text">Stale · {formatDateTime(latestObservation)}</span>
            ) : (
              formatDateTime(latestObservation)
            )
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
