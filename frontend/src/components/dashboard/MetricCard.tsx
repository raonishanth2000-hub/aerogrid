import type { ReactNode } from 'react'
import { InfoTip } from '../common/Tooltip'
import { SkeletonLine } from '../common/States'

interface MetricCardProps {
  label: string
  value: ReactNode
  unit?: string
  description: ReactNode
  info?: ReactNode
  loading?: boolean
  badges?: ReactNode
  emphasis?: boolean
}

export function MetricCard({ label, value, unit, description, info, loading, badges, emphasis }: MetricCardProps) {
  return (
    <div className={`metric-card ${emphasis ? 'is-emphasis' : ''}`}>
      <div className="metric-label">
        <span>{label}</span>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </div>
      <div className="metric-value">
        {loading ? (
          <SkeletonLine width={72} />
        ) : (
          <>
            <span className="metric-number">{value}</span>
            {unit && <span className="metric-unit">{unit}</span>}
          </>
        )}
      </div>
      <div className="metric-desc">
        {description}
        {badges}
      </div>
    </div>
  )
}
