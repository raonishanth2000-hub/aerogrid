import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { MobileNavigation } from '../components/layout/MobileNavigation'
import { Sidebar } from '../components/layout/Sidebar'
import { Topbar } from '../components/layout/Topbar'
import { NAV_ITEMS, type RouteId } from './navigation'

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
  const mainRef = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // Per-page tab title, and move focus to the new page for keyboard and screen-reader users.
  useEffect(() => {
    const label = NAV_ITEMS.find((n) => n.id === route)?.label
    document.title = label ? `${label} · AeroGrid` : 'AeroGrid'
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    mainRef.current?.focus({ preventScroll: true })
  }, [route])

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
        <main id="main" className="content" tabIndex={-1} ref={mainRef}>
          {children}
        </main>
      </div>
    </div>
  )
}
