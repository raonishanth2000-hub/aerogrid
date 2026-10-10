import { useId } from 'react'
import type { SeriesPoint } from '../../utils/series'

interface SparklineProps {
  points: SeriesPoint[]
  width?: number
  height?: number
  color?: string
}

/** Tiny decorative trend line. Breaks at missing values; callers provide the text equivalent. */
export function Sparkline({ points, width = 120, height = 32, color = 'var(--accent)' }: SparklineProps) {
  const gid = `spark-${useId().replace(/[^a-zA-Z0-9-]/g, '')}`
  const valid = points.filter((p) => p.value !== null) as Array<{ t: number; value: number }>
  if (valid.length < 2) return null
  const t0 = points[0].t
  const t1 = points[points.length - 1].t
  const vMax = Math.max(...valid.map((p) => p.value))
  const vMin = Math.min(...valid.map((p) => p.value))
  const x = (t: number) => ((t - t0) / (t1 - t0 || 1)) * width
  const y = (v: number) => height - 2 - ((v - vMin) / (vMax - vMin || 1)) * (height - 4)

  // Split into runs of consecutive valid values so gaps are not bridged.
  const runs: Array<Array<[number, number]>> = []
  let run: Array<[number, number]> = []
  for (const p of points) {
    if (p.value === null) {
      if (run.length) runs.push(run)
      run = []
    } else run.push([x(p.t), y(p.value)])
  }
  if (run.length) runs.push(run)
  const last = valid[valid.length - 1]

  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {runs.map((r, i) => {
        const line = r.map(([px, py], j) => `${j ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join('')
        return (
          <g key={i}>
            <path d={`${line}L${r[r.length - 1][0].toFixed(1)},${height}L${r[0][0].toFixed(1)},${height}Z`} fill={`url(#${gid})`} />
            <path d={line} fill="none" style={{ stroke: color }} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        )
      })}
      <circle cx={x(last.t)} cy={y(last.value)} r="3" style={{ fill: 'var(--contrast)' }} />
    </svg>
  )
}
