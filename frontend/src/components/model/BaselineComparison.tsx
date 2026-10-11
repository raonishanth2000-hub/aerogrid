import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { MetricsResponse } from '../../types/api'
import { formatMetric, formatSigned } from '../../utils/formatters'
import { chartTheme } from '../analytics/chartTheme'

export function BaselineComparison({ m }: { m: MetricsResponse }) {
  const theme = chartTheme()
  const rows = [
    { method: m.model_name ?? 'AeroGrid model', mae: m.mae, rmse: m.rmse, bias: m.bias, isModel: true },
    ...(m.baselines ?? []).map((b) => ({ method: b.method, mae: b.mae, rmse: b.rmse, bias: b.bias ?? null, isModel: false })),
  ].filter((r) => r.mae !== null || r.rmse !== null)

  // Plain-language comparison with the strongest simple method, by average error.
  const best = rows
    .filter((r) => !r.isModel && r.mae !== null)
    .reduce<(typeof rows)[number] | null>((acc, r) => (acc === null || r.mae! < acc.mae! ? r : acc), null)
  const change = best && m.mae !== null && best.mae ? ((best.mae - m.mae) / best.mae) * 100 : null

  return (
    <div className="baseline">
      {change !== null && best && (
        <p className="baseline-summary">
          The model&rsquo;s average error is{' '}
          <strong>
            {Math.abs(change).toFixed(1)}% {change >= 0 ? 'lower' : 'higher'}
          </strong>{' '}
          than the best simple method ({best.method}).
        </p>
      )}
      <div className="chart-box" style={{ height: 40 + rows.length * 48 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 8 }} barGap={2}>
            <CartesianGrid {...theme.grid} horizontal={false} />
            <XAxis type="number" {...theme.axis} domain={[0, 'auto']} label={{ value: 'Error (µg/m³) — lower is better', fill: theme.text3, fontSize: 11, position: 'insideBottom', dy: 8 }} height={36} />
            <YAxis type="category" dataKey="method" {...theme.axis} width={130} />
            <Tooltip {...theme.tooltip} cursor={{ fill: 'rgba(255,255,255,0.04)' }} formatter={(v) => `${formatMetric(v as number)} µg/m³`} />
            <Legend wrapperStyle={{ fontSize: 12, color: theme.text2 }} />
            <Bar dataKey="mae" name="MAE" fill={theme.series[0].color} isAnimationActive={false} />
            <Bar dataKey="rmse" name="RMSE" fill={theme.text3} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="data-table">
        <caption className="table-caption">All errors in µg/m³ on the evaluation split reported by the backend</caption>
        <thead>
          <tr>
            <th scope="col">Method</th>
            <th scope="col">MAE</th>
            <th scope="col">RMSE</th>
            <th scope="col">Bias</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.method} className={r.isModel ? 'is-highlight' : ''}>
              <th scope="row">
                {r.method} {r.isModel && <span className="tag">Model</span>}
              </th>
              <td>{formatMetric(r.mae)}</td>
              <td>{formatMetric(r.rmse)}</td>
              <td>{formatSigned(r.bias)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
