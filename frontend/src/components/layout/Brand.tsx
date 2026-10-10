import { MapPinned } from 'lucide-react'

export function Brand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <a className="brand" href="#/overview" aria-label="AeroGrid — Hyperlocal Air Intelligence, go to overview">
      <span className="brand-icon" aria-hidden="true">
        <MapPinned size={18} strokeWidth={2.2} />
      </span>
      {!collapsed && (
        <span className="brand-text">
          <span className="brand-name">AeroGrid</span>
          <span className="brand-tag">Hyperlocal Air Intelligence</span>
        </span>
      )}
    </a>
  )
}
