import { Activity, Info, LayoutDashboard, LineChart, Radar, type LucideIcon } from 'lucide-react'

export type RouteId = 'overview' | 'analytics' | 'model' | 'gaps' | 'about'

export interface NavItem {
  id: RouteId
  label: string
  icon: LucideIcon
  description: string
  group: 'Workspace' | 'Insights' | 'Project'
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'City map and summary', group: 'Workspace' },
  { id: 'analytics', label: 'Air Quality Analytics', icon: LineChart, description: 'Station history and comparison', group: 'Insights' },
  { id: 'model', label: 'Model Performance', icon: Activity, description: 'Validation results', group: 'Insights' },
  { id: 'gaps', label: 'Monitoring Gaps', icon: Radar, description: 'Network coverage', group: 'Insights' },
  { id: 'about', label: 'About AeroGrid', icon: Info, description: 'Method and limitations', group: 'Project' },
]

export const NAV_GROUPS = ['Workspace', 'Insights', 'Project'] as const

export const DEFAULT_ROUTE: RouteId = 'overview'

export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return NAV_ITEMS.some((n) => n.id === id) ? (id as RouteId) : DEFAULT_ROUTE
}

export const hrefFor = (id: RouteId) => `#/${id}`
