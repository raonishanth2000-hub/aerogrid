import { useApp } from '../../app/appContext'
import { config } from '../../config'
import { formatDateTime, formatRelative, isStale } from '../../utils/formatters'

/** Reports the age of the newest underlying observation — never claims "live". */
export function DataFreshness() {
  const { health, stations, latestObservation, dataMode } = useApp()

  if (health.status === 'error') {
    return (
      <span className="pill pill-error" title={health.error.message}>
        <span className="status-dot" aria-hidden="true" />
        API unreachable
      </span>
    )
  }
  if (!stations.data) {
    return (
      <span className="pill pill-muted">
        <span className="status-dot" aria-hidden="true" />
        {stations.status === 'error' ? 'No station data' : 'Checking data…'}
      </span>
    )
  }
  const degraded = health.data && health.data.data.status !== 'ok'
  const stale = isStale(latestObservation, config.staleAfterMinutes)
  const tone = degraded || stale ? 'pill-warn' : 'pill-ok'
  const title = latestObservation
    ? `Newest station observation: ${formatDateTime(latestObservation)}${dataMode === 'mock' ? ' (demo data)' : ''}`
    : 'No timestamped observations'
  return (
    <span className={`pill ${tone}`} title={title}>
      <span className="status-dot" aria-hidden="true" />
      <span className="pill-text">
        {degraded ? `API ${health.data!.data.status} · ` : ''}
        {latestObservation ? `Obs. ${formatRelative(latestObservation)}` : 'Obs. time unavailable'}
        {stale && latestObservation ? ' · stale' : ''}
      </span>
    </span>
  )
}
