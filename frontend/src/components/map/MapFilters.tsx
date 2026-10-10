import { useApp } from '../../app/appContext'

export function MapFilters({ showEstimatesToggle = true }: { showEstimatesToggle?: boolean }) {
  const { layers, setLayers } = useApp()
  return (
    <div className="layer-chips" role="group" aria-label="Map layers">
      <button
        type="button"
        className="layer-chip"
        aria-pressed={layers.stations}
        onClick={() => setLayers({ ...layers, stations: !layers.stations })}
      >
        <span className="glyph glyph-circle" aria-hidden="true" />
        Stations
      </button>
      {showEstimatesToggle && (
        <button
          type="button"
          className="layer-chip"
          aria-pressed={layers.estimates}
          onClick={() => setLayers({ ...layers, estimates: !layers.estimates })}
        >
          <span className="glyph glyph-diamond" aria-hidden="true" />
          Estimates
        </button>
      )}
      <button type="button" className="layer-chip" aria-pressed={false} disabled title="Coverage analysis has not been provided by the backend yet">
        Gaps <span className="tag">Pending</span>
      </button>
    </div>
  )
}
