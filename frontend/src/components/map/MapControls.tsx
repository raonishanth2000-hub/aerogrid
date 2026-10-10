import type L from 'leaflet'
import { Maximize } from 'lucide-react'
import { useApp } from '../../app/appContext'

export function MapControls({ map }: { map: L.Map | null }) {
  const { city } = useApp()
  return (
    <div className="map-controls">
      <button
        type="button"
        className="map-ctrl-btn"
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
