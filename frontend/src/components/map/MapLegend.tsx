import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { useApp } from '../../app/appContext'
import { BAND_SOURCE, PM25_BANDS, UNAVAILABLE_COLOR, bandKey, bandRangeLabel } from '../../utils/pm25Bands'
import { ScaleBar } from '../common/ScaleBar'
import { InfoTip } from '../common/Tooltip'

const OPEN_KEY = 'aerogrid.legendOpen'
const SHORT: Record<string, string> = { b1: 'Good', b2: 'Satisf.', b3: 'Moderate', b4: 'Poor', b5: 'V. poor', b6: 'Severe' }

function readOpen(): boolean {
  try {
    const v = localStorage.getItem(OPEN_KEY)
    if (v !== null) return v === '1'
  } catch {
    /* storage unavailable */
  }
  return !window.matchMedia('(max-width: 767px), (max-height: 760px)').matches
}

/** Legend that doubles as a band filter: each band toggles its markers on the map. */
export function MapLegend() {
  const { stationList, hiddenBands, toggleBand } = useApp()
  const [open, setOpen] = useState(readOpen)

  const toggleOpen = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? '0' : '1')
      } catch {
        /* storage unavailable */
      }
      return !o
    })

  const counts = new Map<string, number>()
  for (const s of stationList) counts.set(bandKey(s.value), (counts.get(bandKey(s.value)) ?? 0) + 1)
  const hiddenCount = stationList.filter((s) => hiddenBands.includes(bandKey(s.value))).length
  const filters = [
    ...PM25_BANDS.map((b) => ({ key: b.key, label: SHORT[b.key], full: `${b.label} (${bandRangeLabel(b)} µg/m³)`, color: b.color })),
    { key: 'none', label: 'No value', full: 'No valid reading', color: UNAVAILABLE_COLOR },
  ]

  return (
    <div className={`legend ${open ? 'is-open' : ''}`}>
      <div className="legend-head">
        <button type="button" className="legend-toggle" aria-expanded={open} onClick={toggleOpen}>
          PM2.5 <span className="muted">µg/m³</span>
          {hiddenBands.length > 0 && <span className="legend-filtered">filtered</span>}
          <ChevronDown size={14} aria-hidden="true" className="legend-chevron" />
        </button>
        <InfoTip label="concentration bands">{BAND_SOURCE}</InfoTip>
      </div>
      {open && (
        <div className="legend-body">
          <ScaleBar value={null} showLabels />
          <div className="legend-filters" role="group" aria-label="Show or hide markers by concentration band">
            {filters.map((f) => {
              const shown = !hiddenBands.includes(f.key)
              return (
                <button
                  key={f.key}
                  type="button"
                  className="legend-filter"
                  aria-pressed={shown}
                  title={`${shown ? 'Hide' : 'Show'} ${f.full}`}
                  onClick={() => toggleBand(f.key)}
                >
                  <span className={`swatch ${f.key === 'none' ? 'swatch-none' : ''}`} style={{ background: f.color }} aria-hidden="true" />
                  {f.label}
                  <span className="legend-count">{counts.get(f.key) ?? 0}</span>
                </button>
              )
            })}
          </div>
          {hiddenBands.length > 0 && (
            <p className="legend-note">
              {hiddenCount} of {stationList.length} stations hidden ·{' '}
              <button type="button" className="link-btn" onClick={() => hiddenBands.forEach(toggleBand)}>
                Show all
              </button>
            </p>
          )}
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
