import { useApp } from '../../app/appContext'
import { formatConcentration } from '../../utils/formatters'
import { EmptyState } from '../common/States'
import { ModeBadge } from '../common/StatusBadge'

/** Lists prediction intervals exactly as returned by /api/predict for this session's estimates. */
export function EstimateUncertainty() {
  const { estimates, select } = useApp()
  const rows = estimates.filter((e) => e.status === 'ready' && e.result?.data.value !== null)
  const withUnc = rows.filter((e) => {
    const u = e.result?.data.uncertainty
    return u && ((u.lower != null && u.upper != null) || u.std != null)
  })

  if (!rows.length) {
    return <EmptyState compact title="No estimates yet" message="Request estimates on the Overview or Explore Map page; their reported uncertainty is listed here." />
  }
  if (!withUnc.length) {
    return <EmptyState compact title="Uncertainty not supplied" message="The prediction API has not returned uncertainty for the estimates made so far." />
  }
  return (
    <table className="data-table">
      <caption className="table-caption">Prediction intervals reported by the model</caption>
      <thead>
        <tr>
          <th scope="col">Location</th>
          <th scope="col">Estimate</th>
          <th scope="col">Interval</th>
          <th scope="col">Width</th>
        </tr>
      </thead>
      <tbody>
        {withUnc.map((e) => {
          const d = e.result!.data
          const u = d.uncertainty!
          const hasInterval = u.lower != null && u.upper != null
          return (
            <tr key={e.id}>
              <th scope="row">
                <a href="#/overview" className="link" onClick={() => select({ kind: 'estimate', id: e.id })}>
                  {e.latitude.toFixed(3)}, {e.longitude.toFixed(3)}
                </a>{' '}
                <ModeBadge mode={e.result?.mode} />
              </th>
              <td>{formatConcentration(d.value)}</td>
              <td>
                {hasInterval ? `${formatConcentration(u.lower)}–${formatConcentration(u.upper)}` : `± ${formatConcentration(u.std)} (1 s.d.)`}
                {u.confidence_level != null && <span className="muted"> · {Math.round(u.confidence_level * 100)}%</span>}
              </td>
              <td>{hasInterval ? formatConcentration(u.upper! - u.lower!) : formatConcentration(2 * u.std!)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
