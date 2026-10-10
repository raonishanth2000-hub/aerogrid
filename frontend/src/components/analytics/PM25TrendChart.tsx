import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { TimeRange } from '../../types/app'
import { formatConcentration, formatDateTime } from '../../utils/formatters'
import { NAAQS_24H_PM25 } from '../../utils/pm25Bands'
import type { SeriesPoint } from '../../utils/series'
import { chartTheme } from './chartTheme'

interface PM25TrendChartProps {
  points: SeriesPoint[]
  stationName: string
  range: TimeRange
  start: number
  end: number
}

const tickFormat = (range: TimeRange) =>
  new Intl.DateTimeFormat(undefined, range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' })

export function PM25TrendChart({ points, stationName, range, start, end }: PM25TrendChartProps) {
  const theme = chartTheme()
  const fmt = tickFormat(range)
  const valid = points.filter((p) => p.value !== null).length
  // Show individual observations when the record is sparse, so irregular sampling is visible.
  const showDots = valid > 0 && valid <= 80

  return (
    <figure className="chart-figure">
      <figcaption className="chart-title">
        Measured PM2.5 at {stationName} <span className="muted">· µg/m³</span>
      </figcaption>
      <div className="chart-box" style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
            <CartesianGrid {...theme.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              scale="time"
              domain={[start, end]}
              tickFormatter={(t: number) => fmt.format(t)}
              {...theme.axis}
              minTickGap={40}
            />
            <YAxis
              {...theme.axis}
              width={44}
              domain={[0, 'auto']}
              label={{ value: 'µg/m³', angle: -90, position: 'insideLeft', fill: theme.text3, fontSize: 11, dy: 20 }}
            />
            <Tooltip
              {...theme.tooltip}
              labelFormatter={(t) => formatDateTime(Number(t))}
              formatter={(v) => [`${formatConcentration(v as number)} µg/m³`, 'Measured PM2.5']}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: theme.text2 }} />
            <ReferenceLine
              y={NAAQS_24H_PM25}
              stroke={theme.warn}
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
              label={{ value: `NAAQS 24-h standard (${NAAQS_24H_PM25})`, fill: theme.warn, fontSize: 11, position: 'insideTopRight' }}
            />
            <Line
              type="linear"
              dataKey="value"
              name="Measured PM2.5"
              stroke={theme.accent}
              strokeWidth={1.8}
              dot={showDots ? { r: 2.5, fill: theme.accent, strokeWidth: 0 } : false}
              activeDot={{ r: 4 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="sr-only">
        Line chart of {valid} measured PM2.5 observations at {stationName} from {formatDateTime(start)} to {formatDateTime(end)}.
      </p>
      <p className="chart-note muted small">
        Breaks in the line mark missing observations or gaps in the record; values are not interpolated. The dashed line is
        India’s 24-hour PM2.5 standard, shown for reference — it applies to daily averages, not individual readings.
      </p>
    </figure>
  )
}
