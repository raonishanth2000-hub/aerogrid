import { useApp } from '../../app/appContext'
import { formatConcentration, formatCount, stationLabel } from '../../utils/formatters'
import { median, nearestNeighbourDistances } from '../../utils/geo'
import { InfoTip } from '../common/Tooltip'

export function CoverageSummary() {
  const { stationList } = useApp()
  const reporting = stationList.filter((s) => s.value !== null)
  const spacing = nearestNeighbourDistances(stationList).toSorted((a, b) => b.distanceKm - a.distanceKm)
  const distances = spacing.map((s) => s.distanceKm)

  return (
    <div className="coverage-summary">
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-label">Stations in data</div>
          <div className="kpi-value">{formatCount(stationList.length)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">With a valid latest reading</div>
          <div className="kpi-value">{formatCount(reporting.length)}</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">
            Median station spacing
            <InfoTip label="station spacing">
              Distance from each station to its nearest neighbouring station, from coordinates only. It describes how dense the
              network is — it is not a measure of prediction error.
            </InfoTip>
          </div>
          <div className="kpi-value">
            {distances.length ? median(distances)!.toFixed(1) : '—'}
            {distances.length > 0 && <span className="kpi-unit">km</span>}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Largest station spacing</div>
          <div className="kpi-value">
            {distances.length ? Math.max(...distances).toFixed(1) : '—'}
            {distances.length > 0 && <span className="kpi-unit">km</span>}
          </div>
        </div>
      </div>

      {spacing.length > 0 && (
        <table className="data-table">
          <caption className="table-caption">Most isolated stations (distance to nearest other station)</caption>
          <thead>
            <tr>
              <th scope="col">Station</th>
              <th scope="col">Nearest neighbour</th>
              <th scope="col">Latest reading</th>
            </tr>
          </thead>
          <tbody>
            {spacing.slice(0, 5).map(({ point, distanceKm }) => (
              <tr key={point.id}>
                <th scope="row">{stationLabel(point)}</th>
                <td>{distanceKm.toFixed(1)} km</td>
                <td>{point.value === null ? <span className="muted">Unavailable</span> : `${formatConcentration(point.value)} µg/m³`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
