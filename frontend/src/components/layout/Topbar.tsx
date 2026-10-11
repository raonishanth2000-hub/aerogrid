import { Menu, RefreshCw } from 'lucide-react'
import { NAV_ITEMS, type RouteId } from '../../app/navigation'
import { useApp } from '../../app/appContext'
import { POLLUTANTS, type PollutantId } from '../../config'
import { CityAirChip } from '../dashboard/CityAirChip'
import { DataFreshness } from '../dashboard/DataFreshness'
import { DataSourceSwitch } from './DataSourceSwitch'

interface TopbarProps {
  route: RouteId
  onOpenMenu: () => void
}

export function Topbar({ route, onOpenMenu }: TopbarProps) {
  const { city, cities, setCityId, pollutant, setPollutant, refreshAll, isRefreshing, dataMode } = useApp()
  const page = NAV_ITEMS.find((n) => n.id === route)

  return (
    <header className="topbar">
      <button type="button" className="btn btn-ghost btn-icon topbar-menu" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu size={18} aria-hidden="true" />
      </button>
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <span className="breadcrumb-root">AeroGrid</span>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{page?.label}</span>
      </nav>

      <div className="topbar-controls">
        <div className="context-group">
          <label className="field">
            <span className="field-label">City</span>
            <select
              className="select"
              value={city.id}
              onChange={(e) => setCityId(e.target.value)}
              disabled={cities.length < 2}
              title={
                cities.length < 2
                  ? 'The AeroGrid model is trained for this city only'
                  : dataMode === 'mock'
                    ? 'Demo mode: each city uses synthetic data at a different pollution level'
                    : 'Each city has its own station data and AeroGrid model'
              }
            >
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {dataMode === 'mock' ? ' (demo)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Pollutant</span>
            <select
              className="select"
              value={pollutant}
              onChange={(e) => setPollutant(e.target.value as PollutantId)}
              disabled={POLLUTANTS.length < 2}
              title={POLLUTANTS.length < 2 ? 'PM2.5 is the only pollutant currently supported' : undefined}
            >
              {POLLUTANTS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CityAirChip />
        <DataFreshness />
        <DataSourceSwitch />
        <button
          type="button"
          className="btn btn-secondary btn-icon"
          onClick={refreshAll}
          disabled={isRefreshing}
          aria-label={isRefreshing ? 'Refreshing data' : 'Refresh data'}
          title="Re-fetch stations, metrics and API status"
        >
          <RefreshCw size={16} aria-hidden="true" className={isRefreshing ? 'spin' : ''} />
        </button>
      </div>
    </header>
  )
}
