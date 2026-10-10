import type { SeriesStats } from '../../utils/series'
import { formatConcentration, formatCount, formatShortDateTime } from '../../utils/formatters'

export function SummaryStatistics({ stats, gaps, rangeLabel }: { stats: SeriesStats; gaps: number; rangeLabel: string }) {
  return (
    <div className="summary-stats">
      <dl className="stat-grid">
        <div>
          <dt>Mean</dt>
          <dd>
            {formatConcentration(stats.mean)} <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>Minimum</dt>
          <dd>
            {formatConcentration(stats.min)} <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>Maximum</dt>
          <dd>
            {formatConcentration(stats.max)} <span className="unit">µg/m³</span>
          </dd>
        </div>
        <div>
          <dt>Observations</dt>
          <dd>{formatCount(stats.count)}</dd>
        </div>
        <div>
          <dt>Missing values</dt>
          <dd>{formatCount(stats.missing)}</dd>
        </div>
        <div>
          <dt>Gaps in record</dt>
          <dd>{formatCount(gaps)}</dd>
        </div>
      </dl>
      <p className="muted small">
        Computed from the {formatCount(stats.count)} valid records displayed
        {stats.start !== null && stats.end !== null
          ? `, ${formatShortDateTime(stats.start)} – ${formatShortDateTime(stats.end)}`
          : ''}{' '}
        (window: last {rangeLabel} of the record). Statistics are of the raw observations, not daily averages.
      </p>
    </div>
  )
}
