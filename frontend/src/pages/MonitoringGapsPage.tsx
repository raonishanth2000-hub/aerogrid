import { useApp } from '../app/appContext'
import { Panel } from '../components/common/Panel'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { CoverageSummary } from '../components/coverage/CoverageSummary'
import { EstimateUncertainty } from '../components/coverage/EstimateUncertainty'
import { PageHeader } from '../components/layout/PageHeader'
import { MapWorkspace } from '../components/map/MapWorkspace'

export function MonitoringGapsPage() {
  const { city, stations } = useApp()
  return (
    <div className="page">
      <PageHeader
        eyebrow={`${city.name} · Station network`}
        title="Monitoring Gaps"
        subtitle="Where the station network is sparse, more of the city depends on model estimates rather than direct measurement."
      />
      <div className="grid-gaps">
        <MapWorkspace className="workspace-gaps" allowEstimates={false} />
        <div className="stack">
          <Panel id="network" title="Station network" subtitle="Derived from station coordinates only" mode={stations.data?.mode}>
            {stations.status === 'loading' && !stations.data ? (
              <LoadingState compact title="Loading stations…" />
            ) : !stations.data ? (
              <ErrorState compact title="Station data unavailable" message={stations.error?.message} onRetry={stations.reload} />
            ) : (
              <CoverageSummary />
            )}
          </Panel>
          <Panel id="coverage-analysis" title="Coverage analysis">
            <EmptyState
              compact
              title="Coverage analysis pending"
              message="A defensible map of under-monitored areas (and any candidate sites for new monitors) needs an analysis from the backend/ML team. Until it exists, no coverage surface or percentage is shown."
            />
          </Panel>
        </div>
      </div>
      <div className="grid-2">
        <Panel id="uncertainty" title="Estimate uncertainty" subtitle="As reported by the prediction API">
          <EstimateUncertainty />
        </Panel>
        <Panel id="method" title="Methodology">
          <div className="prose">
            <p>
              Station counts and spacing are computed in the browser from the coordinates returned by <code>/api/stations</code>.
              Spacing is the great-circle distance from each station to its nearest neighbour.
            </p>
            <p>
              Distance from a station is not treated as prediction error: a location far from monitors can still be predicted
              well (or poorly) depending on local conditions. Uncertainty is shown only when the model itself reports it.
            </p>
          </div>
        </Panel>
      </div>
    </div>
  )
}
