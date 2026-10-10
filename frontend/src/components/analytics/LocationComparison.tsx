import { useMemo } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useApp } from '../../app/appContext'
import type { Station } from '../../types/api'
import type { TimeRange } from '../../types/app'
import { formatConcentration, formatCount, formatDateTime, stationLabel } from '../../utils/formatters'
import { RANGE_LABEL, RANGE_MS, seriesStats, toSeries, windowSeries, withGapBreaks } from '../../utils/series'
import { EmptyState } from '../common/States'
import { chartTheme } from './chartTheme'

const MAX_COMPARE = 4

export function LocationComparison({ stations, range }: { stations: Station[]; range: TimeRange }) {
  const { comparisonIds, setComparisonIds } = useApp()
  const theme = chartTheme()

  const chosen = useMemo(
    () => comparisonIds.map((id) => stations.find((s) => s.id === id)).filter((s): s is Station => !!s),
    [comparisonIds, stations],
  )

  const data = useMemo(() => {
    const all = chosen.map((s) => ({ station: s, series: toSeries(s.history) }))
    // One shared window for every station, anchored at the newest observation among them.
    const end = Math.max(...all.map((a) => a.series.at(-1)?.t ?? -Infinity))
    if (!Number.isFinite(end)) return null
    const start = end - RANGE_MS[range]
    const rows = all.map((a) => {
      const win = windowSeries(a.series, end, range)
      return { station: a.station, points: withGapBreaks(win).points, stats: seriesStats(win) }
    })
    const maxCount = Math.max(...rows.map((r) => r.stats.count), 0)
    return { start, end, rows, maxCount }
  }, [chosen, range])

  const toggle = (id: string) => {
    if (comparisonIds.includes(id)) setComparisonIds(comparisonIds.filter((x) => x !== id))
    else if (comparisonIds.length < MAX_COMPARE) setComparisonIds([...comparisonIds, id])
  }

  const fmt = new Intl.DateTimeFormat(undefined, range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' })

  return (
    <div className="comparison">
      <fieldset className="chip-group">
        <legend className="field-label">Choose up to {MAX_COMPARE} stations</legend>
        {stations.map((s) => {
          const checked = comparisonIds.includes(s.id)
          const disabled = !checked && comparisonIds.length >= MAX_COMPARE
          return (
            <label key={s.id} className={`chip ${checked ? 'is-checked' : ''} ${disabled ? 'is-disabled' : ''}`}>
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(s.id)} />
              {stationLabel(s)}
            </label>
          )
        })}
      </fieldset>

      {!data || chosen.length === 0 ? (
        <EmptyState compact title="Select stations to compare" message="Compare measured PM2.5 across stations over the same time window." />
      ) : (
        <>
          <div className="chart-box" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid {...theme.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[data.start, data.end]}
                  allowDuplicatedCategory={false}
                  tickFormatter={(t: number) => fmt.format(t)}
                  {...theme.axis}
                  minTickGap={40}
                />
                <YAxis {...theme.axis} width={44} domain={[0, 'auto']} />
                <Tooltip {...theme.tooltip} labelFormatter={(t) => formatDateTime(Number(t))} formatter={(v) => `${formatConcentration(v as number)} µg/m³`} />
                <Legend wrapperStyle={{ fontSize: 12, color: theme.text2 }} />
                {data.rows.map((r, i) => (
                  <Line
                    key={r.station.id}
                    data={r.points}
                    dataKey="value"
                    name={stationLabel(r.station)}
                    stroke={theme.series[i].color}
                    strokeDasharray={theme.series[i].dash}
                    strokeWidth={1.6}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table className="data-table">
            <caption className="table-caption">
              Shared window: last {RANGE_LABEL[range]} up to {formatDateTime(data.end)}
            </caption>
            <thead>
              <tr>
                <th scope="col">Station</th>
                <th scope="col">Observations</th>
                <th scope="col">Missing</th>
                <th scope="col">
                  Mean <span className="no-case">(µg/m³)</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => {
                const sparse = data.maxCount > 0 && r.stats.count < data.maxCount * 0.7
                return (
                  <tr key={r.station.id}>
                    <th scope="row">
                      <span className="series-key" style={{ background: theme.series[i].color }} aria-hidden="true" />
                      {stationLabel(r.station)}
                    </th>
                    <td>
                      {formatCount(r.stats.count)}
                      {sparse && <span className="tag tag-warn" title="Fewer observations than other stations in this window">Less complete</span>}
                    </td>
                    <td>{formatCount(r.stats.missing)}</td>
                    <td>{formatConcentration(r.stats.mean)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p className="muted small">
            Means are of the observations available in the window. Stations with fewer observations (or different sampling
            intervals) may not be directly comparable — a lower mean from an incomplete record does not mean cleaner air.
          </p>
        </>
      )}
    </div>
  )
}
