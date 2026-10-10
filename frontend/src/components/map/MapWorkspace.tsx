import type L from 'leaflet'
import { MousePointerClick, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { useApp } from '../../app/appContext'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { AirQualityMap } from './AirQualityMap'
import { LocationDetailsDrawer } from './LocationDetailsDrawer'
import { LocationSearch } from './LocationSearch'
import { MapControls } from './MapControls'
import { MapFilters } from './MapFilters'
import { MapLegend } from './MapLegend'

interface MapWorkspaceProps {
  className?: string
  /** When false, the map shows stations only (no click-to-estimate). */
  allowEstimates?: boolean
}

const DRAWER_WIDTH = 396

export function MapWorkspace({ className = '', allowEstimates = true }: MapWorkspaceProps) {
  const { stations, stationList, select, selection, layers, estimates, clearEstimates } = useApp()
  const [map, setMap] = useState<L.Map | null>(null)
  const isMobile = useMediaQuery('(max-width: 767px)')
  const drawerOpen = selection !== null


  const closeDrawer = useCallback(() => {
    select(null)
    map?.getContainer().focus()
  }, [map, select])

  // On phones the drawer is a viewport-fixed bottom sheet, independent of the scrolling map, so no inset applies.
  const inset = drawerOpen && !isMobile ? { right: DRAWER_WIDTH, bottom: 0 } : { right: 0, bottom: 0 }
  // Centre the point in the part of the map the drawer leaves visible.
  const zoomTo = (lat: number, lon: number) => {
    if (!map) return
    const zoom = Math.max(map.getZoom(), 14)
    const target = map.unproject(map.project([lat, lon], zoom).add([inset.right / 2, inset.bottom / 2]), zoom)
    map.flyTo(target, zoom, { duration: 0.5 })
  }
  const noLayers = !layers.stations && !(allowEstimates && layers.estimates)

  return (
    <section className={`workspace ${className}`} aria-label="Air quality map">
      <div className={`workspace-frame ${drawerOpen ? 'has-drawer' : ''}`}>
        <AirQualityMap onMapReady={setMap} drawerInset={inset} allowEstimates={allowEstimates} />

        <div className="map-top">
          <div className="map-top-left">
            <MapFilters showEstimatesToggle={allowEstimates} />
            {allowEstimates && estimates.length > 0 && (
              <button type="button" className="map-pill" onClick={clearEstimates} title="Remove all estimated points from the map">
                <X size={13} aria-hidden="true" /> Clear {estimates.length} estimate{estimates.length === 1 ? '' : 's'}
              </button>
            )}
          </div>
          <LocationSearch allowCoordinates={allowEstimates} />
        </div>

        <div className="map-status" aria-live="polite">
          {stations.status === 'loading' && !stations.data && (
            <div className="map-banner">
              <span className="spinner spinner-sm" aria-hidden="true" /> Loading monitoring stations…
            </div>
          )}
          {stations.status === 'error' && (
            <div className="map-banner map-banner-error" role="alert">
              <span>
                Stations unavailable: {stations.error.message}
                {stations.data ? ' Showing the last successful load.' : ''}
              </span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={stations.reload}>
                Retry
              </button>
            </div>
          )}
          {stations.status === 'success' && stationList.length === 0 && (
            <div className="map-banner">No monitoring stations were returned for this city.</div>
          )}
          {stations.data && stations.data.data.dropped > 0 && (
            <div className="map-banner map-banner-warn">
              {stations.data.data.dropped} station record(s) were skipped because their coordinates or IDs were invalid.
            </div>
          )}
          {noLayers && <div className="map-banner">All layers are hidden. Turn a layer back on to see markers.</div>}
        </div>

        <MapLegend />
        <MapControls map={map} />

        {allowEstimates && !drawerOpen && stations.data && (
          <p className="map-hint">
            <MousePointerClick size={14} aria-hidden="true" /> Click anywhere to estimate PM2.5 at that point
          </p>
        )}

        <LocationDetailsDrawer onClose={closeDrawer} onZoomTo={zoomTo} />
      </div>
    </section>
  )
}
