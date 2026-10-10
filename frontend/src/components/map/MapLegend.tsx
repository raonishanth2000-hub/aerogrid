import { useState } from 'react'
import { BAND_SOURCE, PM25_BANDS, bandRangeLabel } from '../../utils/pm25Bands'

export function MapLegend() {
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767px), (max-height: 760px)').matches)
  return (
    <details className="legend" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="legend-summary">Legend · PM2.5 µg/m³</summary>
      <div className="legend-body">
        <ul className="legend-kinds" aria-label="Marker types">
          <li>
            <span className="mk mk-station mk-legend" style={{ ['--c' as string]: 'var(--text-2)' }} aria-hidden="true" />
            Measured observation
          </li>
          <li>
            <span className="mk mk-estimate mk-legend is-ready" style={{ ['--c' as string]: 'var(--text-2)' }} aria-hidden="true" />
            Model estimate
          </li>
          <li>
            <span className="mk mk-station mk-legend is-unavailable" aria-hidden="true" />
            Value unavailable
          </li>
        </ul>
        <p className="legend-heading">Concentration bands</p>
        <ul className="legend-bands" aria-label="Concentration bands in µg/m³">
          {PM25_BANDS.map((b) => (
            <li key={b.key}>
              <span className="swatch" style={{ background: b.color }} aria-hidden="true" />
              <span className="legend-range">{bandRangeLabel(b)}</span>
              <span className="muted">{b.label}</span>
            </li>
          ))}
        </ul>
        <p className="legend-note">{BAND_SOURCE}</p>
      </div>
    </details>
  )
}
