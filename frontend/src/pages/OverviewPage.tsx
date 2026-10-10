import { useApp } from '../app/appContext'
import { OverviewGrid } from '../components/dashboard/OverviewGrid'
import { PageHeader } from '../components/layout/PageHeader'
import { MapWorkspace } from '../components/map/MapWorkspace'
import { earliestTime, formatDateTime } from '../utils/formatters'

export function OverviewPage() {
  const { city, stationList, latestObservation } = useApp()
  const earliest = earliestTime(stationList.map((s) => s.timestamp))
  const meta = latestObservation
    ? earliest && earliest !== latestObservation
      ? `${city.name} · station observations from ${formatDateTime(earliest)} to ${formatDateTime(latestObservation)}`
      : `${city.name} · latest station observation ${formatDateTime(latestObservation)}`
    : `${city.name} · observation period unavailable`

  return (
    <div className="page page-overview">
      <PageHeader
        title="Air Quality Overview"
        subtitle="Explore measured air quality and model-based estimates across the city."
        meta={meta}
      />
      <OverviewGrid />
      <MapWorkspace className="workspace-overview" />
    </div>
  )
}
