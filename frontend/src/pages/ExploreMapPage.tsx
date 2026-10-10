import { useMemo, useState } from 'react'
import { useApp } from '../app/appContext'
import { Segmented } from '../components/common/Segmented'
import { EmptyState } from '../components/common/States'
import { ModeBadge } from '../components/common/StatusBadge'
import { MapWorkspace } from '../components/map/MapWorkspace'
import { formatConcentration, formatRelative, stationLabel } from '../utils/formatters'
import { bandColor } from '../utils/pm25Bands'

type Sort = 'name' | 'value'

export function ExploreMapPage() {
  const { stationList, stations, selection, select } = useApp()
  const [sort, setSort] = useState<Sort>('value')

  const sorted = useMemo(
    () =>
      [...stationList].sort((a, b) => {
        if (sort === 'name') return stationLabel(a).localeCompare(stationLabel(b))
        // Unavailable values sort last — they are not "low".
        if (a.value === null) return 1
        if (b.value === null) return -1
        return b.value - a.value
      }),
    [stationList, sort],
  )

  return (
    <div className="page page-explore">
      <h1 className="sr-only">Explore Map</h1>
      <div className="explore-layout">
        <aside className="station-list panel" aria-label="Monitoring stations">
          <header className="station-list-head">
            <h2 className="panel-title">
              Stations <span className="muted">({stationList.length})</span> <ModeBadge mode={stations.data?.mode} />
            </h2>
            <Segmented<Sort>
              label="Sort stations"
              value={sort}
              onChange={setSort}
              options={[
                { value: 'value', label: 'PM2.5' },
                { value: 'name', label: 'Name' },
              ]}
            />
          </header>
          {stationList.length === 0 ? (
            <EmptyState compact title={stations.status === 'loading' ? 'Loading stations…' : 'No stations available'} />
          ) : (
            <ul className="station-items">
              {sorted.map((s) => {
                const active = selection?.kind === 'station' && selection.id === s.id
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`station-item ${active ? 'is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => select({ kind: 'station', id: s.id })}
                    >
                      <span
                        className={`mk mk-station mk-legend ${s.value === null ? 'is-unavailable' : ''}`}
                        style={{ ['--c' as string]: bandColor(s.value) }}
                        aria-hidden="true"
                      />
                      <span className="station-item-name">{stationLabel(s)}</span>
                      <span className="station-item-value">
                        {s.value === null ? <span className="muted">—</span> : formatConcentration(s.value)}
                      </span>
                      <span className="station-item-time muted">{s.timestamp ? formatRelative(s.timestamp) : 'no timestamp'}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="station-list-foot muted">Values in µg/m³ · latest measured reading</p>
        </aside>
        <MapWorkspace className="workspace-explore" />
      </div>
    </div>
  )
}
