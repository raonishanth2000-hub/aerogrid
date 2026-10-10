import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { BAND_SOURCE, PM25_BANDS, bandRangeLabel } from '../../utils/pm25Bands'
import { ScaleBar } from '../common/ScaleBar'
import { InfoTip } from '../common/Tooltip'

const SHORT: Record<string, string> = { b1: 'Good', b2: 'Satisf.', b3: 'Moderate', b4: 'Poor', b5: 'V. poor', b6: 'Severe' }

export function MapLegend() {
  const [open, setOpen] = useState(() => !window.matchMedia('(max-width: 767px)').matches)
  return (
    <div className={`legend ${open ? 'is-open' : ''}`}>
      <div className="legend-head">
        <button type="button" className="legend-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          PM2.5 <span className="muted">µg/m³</span>
          <ChevronDown size={14} aria-hidden="true" className="legend-chevron" />
        </button>
        <InfoTip label="concentration bands">{BAND_SOURCE}</InfoTip>
      </div>
      {open && (
        <div className="legend-body">
          <ScaleBar value={null} showLabels />
          <div className="legend-names" aria-hidden="true">
            {PM25_BANDS.map((b) => (
              <span key={b.key}>{SHORT[b.key]}</span>
            ))}
          </div>
          <ul className="sr-only">
            {PM25_BANDS.map((b) => (
              <li key={b.key}>
                {b.label}: {bandRangeLabel(b)} µg/m³
              </li>
            ))}
          </ul>
          <ul className="legend-kinds" aria-label="Marker types">
            <li>
              <span className="mk mk-station mk-legend" style={{ ['--c' as string]: 'var(--text-2)' }} aria-hidden="true" />
              Measured
            </li>
            <li>
              <span className="mk mk-estimate mk-legend" style={{ ['--c' as string]: 'var(--text-2)' }} aria-hidden="true" />
              Estimate
            </li>
            <li>
              <span className="mk mk-station mk-legend is-unavailable" aria-hidden="true" />
              No value
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
