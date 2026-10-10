import type { Station } from '../../types/api'
import { PM25_BANDS, UNAVAILABLE_COLOR, bandFor } from '../../utils/pm25Bands'

/** Stacked bar: how many stations' latest measured value falls in each concentration band. */
export function BandDistribution({ stations }: { stations: Station[] }) {
  if (!stations.length) return null
  const counts = PM25_BANDS.map((b) => ({ band: b, n: stations.filter((s) => bandFor(s.value)?.key === b.key).length }))
  const unavailable = stations.filter((s) => s.value === null).length
  const summary = counts
    .filter((c) => c.n > 0)
    .map((c) => `${c.n} ${c.band.label.toLowerCase()}`)
    .concat(unavailable ? [`${unavailable} unavailable`] : [])
    .join(', ')

  return (
    <div className="banddist" role="img" aria-label={`Latest measured readings by band: ${summary}`}>
      <div className="banddist-bar">
        {counts.map(
          (c) => c.n > 0 && <span key={c.band.key} style={{ flex: c.n, background: c.band.color }} title={`${c.band.label}: ${c.n}`} />,
        )}
        {unavailable > 0 && <span className="is-unavailable" style={{ flex: unavailable, background: UNAVAILABLE_COLOR }} title={`Unavailable: ${unavailable}`} />}
      </div>
    </div>
  )
}
