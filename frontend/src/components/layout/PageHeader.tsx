import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  subtitle: string
  meta?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, subtitle, meta, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        <p className="page-subtitle">{subtitle}</p>
        {meta && <p className="page-meta">{meta}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}
