import { Crosshair, MapPin, Search } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useApp } from '../../app/appContext'
import { formatConcentration, stationLabel } from '../../utils/formatters'
import { parseCoordinateInput } from '../../utils/validation'

type Option =
  | { kind: 'station'; id: string; label: string; detail: string }
  | { kind: 'coords'; id: string; label: string; detail: string; latitude: number; longitude: number }

/** Search stations by name/id, or type "lat, lon" to request an estimate at that point. */
export function LocationSearch({ allowCoordinates = true }: { allowCoordinates?: boolean }) {
  const { stationList, select, requestEstimate } = useApp()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  const options = useMemo<Option[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: Option[] = []
    const coords = allowCoordinates ? parseCoordinateInput(query) : null
    if (coords) {
      out.push({
        kind: 'coords',
        id: 'coords',
        label: `Estimate at ${coords.latitude.toFixed(4)}, ${coords.longitude.toFixed(4)}`,
        detail: 'Request a model estimate',
        ...coords,
      })
    }
    for (const s of stationList) {
      if (stationLabel(s).toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) {
        out.push({
          kind: 'station',
          id: s.id,
          label: stationLabel(s),
          detail: s.value === null ? 'Measured · unavailable' : `Measured · ${formatConcentration(s.value)} ${s.unit}`,
        })
      }
      if (out.length >= 8) break
    }
    return out
  }, [query, stationList, allowCoordinates])

  const choose = (o: Option) => {
    if (o.kind === 'station') select({ kind: 'station', id: o.id })
    else requestEstimate(o.latitude, o.longitude)
    setQuery('')
    setOpen(false)
  }

  const showList = open && query.trim() !== ''

  return (
    <div className="search">
      <Search size={15} className="search-icon" aria-hidden="true" />
      <input
        type="search"
        className="search-input"
        role="combobox"
        aria-label={allowCoordinates ? 'Search stations or enter latitude, longitude' : 'Search stations'}
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList && options[active] ? `${listId}-${active}` : undefined}
        placeholder={allowCoordinates ? 'Search station or “lat, lon”' : 'Search station'}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setActive((a) => Math.min(a + 1, options.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setActive((a) => Math.max(a - 1, 0))
          } else if (e.key === 'Enter' && options[active]) {
            e.preventDefault()
            choose(options[active])
          } else if (e.key === 'Escape') {
            setOpen(false)
          }
        }}
      />
      {showList && (
        <ul className="search-results" role="listbox" id={listId} aria-label="Search results">
          {options.length === 0 ? (
            <li className="search-empty" role="option" aria-selected="false" aria-disabled="true">
              No matching stations{allowCoordinates ? ' — or enter coordinates like 28.61, 77.21' : ''}
            </li>
          ) : (
            options.map((o, i) => (
              <li
                key={o.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'is-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                onMouseEnter={() => setActive(i)}
              >
                {o.kind === 'station' ? <MapPin size={14} aria-hidden="true" /> : <Crosshair size={14} aria-hidden="true" />}
                <span className="search-label">{o.label}</span>
                <span className="search-detail">{o.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
