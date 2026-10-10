import { Activity, Info, LayoutDashboard, LineChart, Map, Radar, type LucideIcon } from 'lucide-react'

export type RouteId = 'overview' | 'map' | 'analytics' | 'model' | 'gaps' | 'about'

export interface NavItem {
  id: RouteId
  label: string
  icon: LucideIcon
  description: string
}

export const NAV_ITEMS: NavItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, description: 'Summary and city map' },
  { id: 'map', label: 'Explore Map', icon: Map, description: 'Full-screen map and station list' },
  { id: 'analytics', label: 'Air Quality Analytics', icon: LineChart, description: 'Station history and comparison' },
  { id: 'model', label: 'Model Performance', icon: Activity, description: 'Validation results' },
  { id: 'gaps', label: 'Monitoring Gaps', icon: Radar, description: 'Network coverage' },
  { id: 'about', label: 'About AeroGrid', icon: Info, description: 'Method and limitations' },
]

export const DEFAULT_ROUTE: RouteId = 'overview'

export function routeFromHash(hash: string): RouteId {
  const id = hash.replace(/^#\/?/, '').split(/[/?]/)[0]
  return NAV_ITEMS.some((n) => n.id === id) ? (id as RouteId) : DEFAULT_ROUTE
}

export const hrefFor = (id: RouteId) => `#/${id}`
