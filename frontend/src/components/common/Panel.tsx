import type { ReactNode } from 'react'
import type { DataMode } from '../../config'
import { ModeBadge } from './StatusBadge'

interface PanelProps {
  id?: string
  title: string
  subtitle?: ReactNode
  mode?: DataMode
  actions?: ReactNode
  className?: string
  children: ReactNode
}

export function Panel({ id, title, subtitle, mode, actions, className = '', children }: PanelProps) {
  const headingId = `${id ?? title.replace(/\W+/g, '-').toLowerCase()}-heading`
  return (
    <section id={id} className={`panel ${className}`} aria-labelledby={headingId}>
      <header className="panel-header">
        <div className="panel-heading">
          <h2 id={headingId} className="panel-title">
            {title} <ModeBadge mode={mode} />
          </h2>
          {subtitle && <p className="panel-subtitle">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  )
}
