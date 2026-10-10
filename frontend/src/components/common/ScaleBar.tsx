import { PM25_BANDS, scalePosition } from '../../utils/pm25Bands'

/** Concentration band scale with a marker at `value` (no marker when unavailable). */
export function ScaleBar({ value, showLabels = false }: { value: number | null; showLabels?: boolean }) {
  const pos = value !== null && Number.isFinite(value) ? scalePosition(value) : null
  return (
    <div className="scalebar" aria-hidden="true">
      <div className="scalebar-track">
        {PM25_BANDS.map((b) => (
          <span key={b.key} className="scalebar-seg" style={{ background: b.color }} />
        ))}
        {pos !== null && <span className="scalebar-pin" style={{ left: `${pos * 100}%` }} />}
      </div>
      {showLabels && (
        <div className="scalebar-ticks">
          {PM25_BANDS.slice(0, -1).map((b, i) => (
            <span key={b.key} style={{ left: `${((i + 1) / PM25_BANDS.length) * 100}%` }}>
              {b.max}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
