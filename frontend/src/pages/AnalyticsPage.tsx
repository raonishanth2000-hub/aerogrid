import { useMemo } from 'react'
import { useApp } from '../app/appContext'
import { LocationComparison } from '../components/analytics/LocationComparison'
import { PM25TrendChart } from '../components/analytics/PM25TrendChart'
import { SummaryStatistics } from '../components/analytics/SummaryStatistics'
import { Panel } from '../components/common/Panel'
import { Segmented } from '../components/common/Segmented'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { PageHeader } from '../components/layout/PageHeader'
import type { TimeRange } from '../types/app'
import { formatDuration, stationLabel } from '../utils/formatters'
import { KIND_ADJECTIVE, KIND_LABEL } from '../utils/stationKind'
import { RANGE_LABEL, RANGE_MS, rangeAvailable, seriesStats, spanMs, toSeries, windowSeries, withGapBreaks } from '../utils/series'

const RANGES: TimeRange[] = ['24h', '7d', '30d']

export function AnalyticsPage() {
  const { city, stations, stationList, stationKind, selectedStation, select, timeRange, setTimeRange } = useApp()

  const withHistory = useMemo(() => stationList.filter((s) => s.history?.some((p) => p.value !== null)), [stationList])
  const station = selectedStation && withHistory.includes(selectedStation) ? selectedStation : withHistory[0]

  const view = useMemo(() => {
    if (!station) return null
    const series = toSeries(station.history)
    const span = spanMs(series)
    const range = rangeAvailable(timeRange, span) ? timeRange : ([...RANGES].reverse().find((r) => rangeAvailable(r, span)) ?? '24h')
    const end = series.at(-1)?.t ?? 0
    const win = windowSeries(series, end, range)
    const { points, gaps } = withGapBreaks(win)
    return { span, range, end, start: Math.max(end - RANGE_MS[range], series[0]?.t ?? end), points, gaps, stats: seriesStats(win) }
  }, [station, timeRange])

  let body
  if (stations.status === 'loading' && !stations.data) body = <LoadingState title="Loading station history…" />
  else if (!stations.data) body = <ErrorState title="Station data unavailable" message={stations.error?.message} onRetry={stations.reload} />
  else if (!station || !view)
    body = (
      <EmptyState
        title="No historical data available"
        message="The API has not supplied station history yet. Charts will appear here once historical observations are available."
      />
    )
  else
    body = (
      <>
        <div className="analytics-toolbar">
          <label className="field field-inline">
            <span className="field-label">Station</span>
            <select className="select" value={station.id} onChange={(e) => select({ kind: 'station', id: e.target.value })}>
              {withHistory.map((s) => (
                <option key={s.id} value={s.id}>
                  {stationLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <Segmented<TimeRange>
            label="Time range"
            value={view.range}
            onChange={setTimeRange}
            options={RANGES.map((r) => ({
              value: r,
              label: r === '24h' ? '24 h' : r === '7d' ? '7 days' : '30 days',
              disabled: !rangeAvailable(r, view.span),
              title: rangeAvailable(r, view.span) ? undefined : `Record covers only ${formatDuration(view.span)}`,
            }))}
          />
          <span className="muted small">Record length: {formatDuration(view.span)}</span>
        </div>
        <div className="analytics-grid">
          <PM25TrendChart points={view.points} stationName={stationLabel(station)} range={view.range} start={view.start} end={view.end} kind={station.source_type} />
          <div>
            <h3 className="subhead">Summary · last {RANGE_LABEL[view.range]}</h3>
            <SummaryStatistics stats={view.stats} gaps={view.gaps} rangeLabel={RANGE_LABEL[view.range]} />
          </div>
        </div>
      </>
    )

  return (
    <div className="page">
      <PageHeader
        eyebrow={`${city.name} · ${KIND_LABEL[stationKind]} history`}
        title="Air Quality Analytics"
        subtitle={`PM2.5 history at monitoring stations (${KIND_ADJECTIVE[stationKind]} values). AeroGrid estimates have no record and are not shown here.`}
      />
      <Panel id="trend" title="Historical PM2.5" subtitle={`${KIND_LABEL[stationKind]} station values only`} mode={stations.data?.mode}>
        {body}
      </Panel>
      {withHistory.length > 1 && (
        <Panel id="compare" title="Compare stations" subtitle="Same time window and units for every station" mode={stations.data?.mode}>
          <LocationComparison stations={withHistory} range={view?.range ?? timeRange} />
        </Panel>
      )}
    </div>
  )
}
