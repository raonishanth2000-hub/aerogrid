import { NAV_GROUPS, NAV_ITEMS, hrefFor, type RouteId } from '../../app/navigation'

interface NavListProps {
  route: RouteId
  collapsed?: boolean
  onNavigate?: () => void
}

export function NavList({ route, collapsed = false, onNavigate }: NavListProps) {
  return (
    <div className="nav-groups">
      {NAV_GROUPS.map((group) => (
        <div key={group} className="nav-group">
          <p className={collapsed ? 'sr-only' : 'nav-group-label'}>{group}</p>
          <ul className="nav-list">
            {NAV_ITEMS.filter((n) => n.group === group).map(({ id, label, icon: Icon, description }) => (
              <li key={id}>
                <a
                  href={hrefFor(id)}
                  className={`nav-link ${route === id ? 'is-active' : ''}`}
                  aria-current={route === id ? 'page' : undefined}
                  title={collapsed ? `${label} — ${description}` : undefined}
                  onClick={onNavigate}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span className={collapsed ? 'sr-only' : ''}>{label}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
