import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import type { RouteId } from '../../app/navigation'
import { useApp } from '../../app/appContext'
import { Brand } from './Brand'
import { NavList } from './NavList'

interface SidebarProps {
  route: RouteId
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ route, collapsed, onToggle }: SidebarProps) {
  const { dataMode, health } = useApp()
  const tone = dataMode === 'mock' ? 'is-demo' : health.status === 'error' ? 'is-down' : health.status === 'loading' ? 'is-checking' : 'is-api'
  const title = dataMode === 'mock' ? 'Demo data' : 'AeroGrid model'
  const detail =
    dataMode === 'mock'
      ? 'Synthetic fixtures for development'
      : health.status === 'error'
        ? 'Backend unreachable'
        : health.status === 'loading'
          ? 'Checking backend…'
          : health.data?.data.status === 'ok'
            ? 'Backend connected'
            : 'Backend partly available'

  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Primary">
      <div className="sidebar-top">
        <Brand collapsed={collapsed} />
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <NavList route={route} collapsed={collapsed} />
      </nav>
      <div className="sidebar-bottom">
        <div className={`status-card ${tone}`} title={collapsed ? `${title} — ${detail}` : undefined}>
          <span className="mode-dot" aria-hidden="true" />
          {!collapsed && (
            <span className="status-text">
              <span className="status-title">{title}</span>
              <span className="status-detail">{detail}</span>
            </span>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-icon sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
        </button>
      </div>
    </aside>
  )
}
