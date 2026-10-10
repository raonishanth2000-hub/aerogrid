import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SkeletonLine } from '../common/States'
import { InfoTip } from '../common/Tooltip'

interface MetricCardProps {
  label: string
  icon: LucideIcon
  value: ReactNode
  unit?: string
  description: ReactNode
  info?: ReactNode
  loading?: boolean
  badges?: ReactNode
  /** Small data-driven visual (scale, distribution, sparkline). */
  visual?: ReactNode
  aside?: ReactNode
  emphasis?: boolean
}

export function MetricCard({ label, icon: Icon, value, unit, description, info, loading, badges, visual, aside, emphasis }: MetricCardProps) {
  return (
    <div className={`metric-card ${emphasis ? 'is-emphasis' : ''}`}>
      <div className="metric-head">
        <span className="metric-icon" aria-hidden="true">
          <Icon size={15} strokeWidth={2} />
        </span>
        <span className="metric-label">{label}</span>
        {info && <InfoTip label={label}>{info}</InfoTip>}
      </div>
      <div className="metric-main">
        <div className="metric-value">
          {loading ? (
            <SkeletonLine width={84} />
          ) : (
            <>
              <span className="metric-number">{value}</span>
              {unit && <span className="metric-unit">{unit}</span>}
            </>
          )}
        </div>
        {aside && <div className="metric-aside">{aside}</div>}
      </div>
      {visual && <div className="metric-visual">{visual}</div>}
      <div className="metric-desc">
        {description}
        {badges && <span className="metric-badges">{badges}</span>}
      </div>
    </div>
  )
}
