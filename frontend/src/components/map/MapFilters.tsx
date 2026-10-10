import { useApp } from '../../app/appContext'

export function MapFilters({ showEstimatesToggle = true }: { showEstimatesToggle?: boolean }) {
  const { layers, setLayers } = useApp()
  return (
    <fieldset className="layer-filters">
      <legend className="sr-only">Map layers</legend>
      <label className="check">
        <input type="checkbox" checked={layers.stations} onChange={(e) => setLayers({ ...layers, stations: e.target.checked })} />
        <span className="glyph glyph-circle" aria-hidden="true" />
        Monitoring stations
      </label>
      {showEstimatesToggle && (
        <label className="check">
          <input type="checkbox" checked={layers.estimates} onChange={(e) => setLayers({ ...layers, estimates: e.target.checked })} />
          <span className="glyph glyph-diamond" aria-hidden="true" />
          Estimated PM2.5
        </label>
      )}
      <label className="check is-disabled" title="Coverage analysis has not been provided by the backend yet">
        <input type="checkbox" checked={false} disabled readOnly />
        Monitoring gaps <span className="tag">Pending</span>
      </label>
    </fieldset>
  )
}
