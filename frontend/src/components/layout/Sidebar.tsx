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
  const apiLabel = health.status === 'error' ? 'API mode · unreachable' : health.status === 'loading' ? 'API mode · checking…' : `API mode · ${health.data?.data.status ?? 'unknown'}`
  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Primary">
      <div className="sidebar-top">
        <Brand collapsed={collapsed} />
      </div>
      <nav aria-label="Main navigation" className="sidebar-nav">
        <NavList route={route} collapsed={collapsed} />
      </nav>
      <div className="sidebar-bottom">
        {!collapsed && (
          <p className="sidebar-mode">
            <span className={`mode-dot ${dataMode === 'mock' ? 'is-demo' : health.status === 'error' ? 'is-down' : 'is-api'}`} aria-hidden="true" />
            {dataMode === 'mock' ? 'Demo data mode' : apiLabel}
          </p>
        )}
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
