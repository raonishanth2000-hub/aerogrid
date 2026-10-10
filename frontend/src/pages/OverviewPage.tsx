import { Clock3 } from 'lucide-react'
import { useApp } from '../app/appContext'
import { OverviewGrid } from '../components/dashboard/OverviewGrid'
import { PageHeader } from '../components/layout/PageHeader'
import { MapWorkspace } from '../components/map/MapWorkspace'
import { earliestTime, formatPeriod } from '../utils/formatters'

export function OverviewPage() {
  const { city, stationList, latestObservation } = useApp()
  const earliest = earliestTime(stationList.map((s) => s.timestamp))
  const period = latestObservation ? formatPeriod(earliest, latestObservation) : 'Unavailable'

  return (
    <div className="page page-overview">
      <PageHeader
        eyebrow={`${city.name} · PM2.5`}
        title="Air Quality Overview"
        subtitle="Explore measured air quality and model-based estimates across the city."
        actions={
          <span className="period-pill" title="Time range of the latest reading from each station">
            <Clock3 size={14} aria-hidden="true" />
            <span className="period-label">Latest readings</span> {period}
          </span>
        }
      />
      <OverviewGrid />
      <MapWorkspace className="workspace-overview" />
    </div>
  )
}
