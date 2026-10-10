import type L from 'leaflet'
import { Maximize, Minus, Plus } from 'lucide-react'
import { useApp } from '../../app/appContext'

export function MapControls({ map }: { map: L.Map | null }) {
  const { city } = useApp()
  return (
    <div className="map-controls" role="group" aria-label="Map view controls">
      <div className="map-ctrl-stack">
        <button type="button" className="map-ctrl-btn" onClick={() => map?.zoomIn()} disabled={!map} aria-label="Zoom in" title="Zoom in">
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="map-ctrl-btn" onClick={() => map?.zoomOut()} disabled={!map} aria-label="Zoom out" title="Zoom out">
          <Minus size={16} aria-hidden="true" />
        </button>
      </div>
      <button
        type="button"
        className="map-ctrl-btn map-ctrl-single"
        onClick={() => map?.flyToBounds(city.bounds, { duration: 0.4 })}
        disabled={!map}
        aria-label={`Reset view to ${city.name}`}
        title={`Fit to ${city.name}`}
      >
        <Maximize size={15} aria-hidden="true" />
      </button>
    </div>
  )
}
