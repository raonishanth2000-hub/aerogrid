import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { RouteId } from '../../app/navigation'
import { Brand } from './Brand'
import { DataSourceSwitch } from './DataSourceSwitch'
import { NavList } from './NavList'

interface MobileNavigationProps {
  open: boolean
  route: RouteId
  onClose: () => void
}

export function MobileNavigation({ open, route, onClose }: MobileNavigationProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="mobile-nav" role="dialog" aria-modal="true" aria-label="Navigation">
      <button type="button" className="mobile-nav-scrim" aria-label="Close navigation" onClick={onClose} tabIndex={-1} />
      <div className="mobile-nav-panel" ref={panelRef}>
        <div className="mobile-nav-head">
          <Brand />
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close navigation">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <nav aria-label="Main navigation">
          <NavList route={route} onNavigate={onClose} />
        </nav>
        <div className="mobile-nav-source">
          <p className="nav-group-label">Data source</p>
          <DataSourceSwitch />
        </div>
      </div>
    </div>
  )
}
