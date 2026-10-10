import { useCallback, useState, type ReactNode } from 'react'
import { MobileNavigation } from '../components/layout/MobileNavigation'
import { Sidebar } from '../components/layout/Sidebar'
import { Topbar } from '../components/layout/Topbar'
import type { RouteId } from './navigation'

const COLLAPSE_KEY = 'aerogrid.sidebarCollapsed'

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1'
  } catch {
    return false
  }
}

export function AppLayout({ route, children }: { route: RouteId; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [menuOpen, setMenuOpen] = useState(false)

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !c
    })
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <div className={`shell ${collapsed ? 'is-collapsed' : ''}`}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar route={route} collapsed={collapsed} onToggle={toggle} />
      <MobileNavigation open={menuOpen} route={route} onClose={closeMenu} />
      <div className="shell-main">
        <Topbar route={route} onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
