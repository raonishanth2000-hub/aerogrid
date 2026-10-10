import { AlertTriangle, Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

interface StateProps {
  title: string
  message?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function LoadingState({ title = 'Loading…', compact }: Partial<StateProps>) {
  return (
    <div className={`state ${compact ? 'state-compact' : ''}`} role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p className="state-title">{title}</p>
    </div>
  )
}

export function ErrorState({ title, message, onRetry, compact }: StateProps & { onRetry?: () => void }) {
  return (
    <div className={`state state-error ${compact ? 'state-compact' : ''}`} role="alert">
      <AlertTriangle size={20} className="state-icon" aria-hidden="true" />
      <p className="state-title">{title}</p>
      {message && <p className="state-message">{message}</p>}
      {onRetry && (
        <button type="button" className="btn btn-secondary btn-sm" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, message, action, compact }: StateProps) {
  return (
    <div className={`state ${compact ? 'state-compact' : ''}`} role="status">
      <Inbox size={20} className="state-icon muted" aria-hidden="true" />
      <p className="state-title">{title}</p>
      {message && <p className="state-message">{message}</p>}
      {action}
    </div>
  )
}

export function SkeletonLine({ width = 80 }: { width?: number }) {
  return <span className="skeleton" style={{ width }} aria-hidden="true" />
}
