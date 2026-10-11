import type { CSSProperties } from 'react'
import { CartesianGrid, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts'
import type { HeldOutPrediction } from '../../types/api'
import { formatConcentration } from '../../utils/formatters'
import { chartTheme } from '../analytics/chartTheme'

export function ActualVsPredictedChart({ points }: { points: HeldOutPrediction[] }) {
  const theme = chartTheme()
  const max = Math.ceil(Math.max(...points.flatMap((p) => [p.actual, p.predicted]), 10) / 25) * 25

  return (
    <figure className="chart-figure">
      <div className="chart-box chart-square">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 16, left: 4 }}>
            <CartesianGrid {...theme.grid} />
            <XAxis type="number" dataKey="actual" name="Actual" domain={[0, max]} {...theme.axis} label={{ value: 'Actual PM2.5 (µg/m³)', fill: theme.text3, fontSize: 11, position: 'insideBottom', dy: 14 }} />
            <YAxis type="number" dataKey="predicted" name="Predicted" domain={[0, max]} {...theme.axis} width={48} label={{ value: 'Predicted (µg/m³)', angle: -90, fill: theme.text3, fontSize: 11, position: 'insideLeft', dy: 50 }} />
            <ReferenceLine segment={[{ x: 0, y: 0 }, { x: max, y: max }]} stroke={theme.warn} strokeDasharray="5 4" ifOverflow="hidden" label={{ value: 'Perfect agreement', fill: theme.warn, fontSize: 11, position: 'insideTopLeft' }} />
            <Tooltip
              {...theme.tooltip}
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload as HeldOutPrediction | undefined
                if (!p) return null
                return (
                  <div style={theme.tooltip.contentStyle as CSSProperties} className="chart-tooltip">
                    {p.station_name && <strong>{p.station_name}</strong>}
                    <div>Actual: {formatConcentration(p.actual)} µg/m³</div>
                    <div>Predicted: {formatConcentration(p.predicted)} µg/m³</div>
                    <div>Error: {formatConcentration(p.predicted - p.actual)} µg/m³</div>
                  </div>
                )
              }}
            />
            <Scatter data={points} fill={theme.accent} fillOpacity={0.7} isAnimationActive={false} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="muted small">
        {points.length} held-out predictions. Points on the dashed line are predicted exactly; points above it are over-estimates.
      </figcaption>
    </figure>
  )
}
