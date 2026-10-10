import type L from 'leaflet'
import { useEffect, useMemo } from 'react'
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet'
import { useApp } from '../../app/appContext'
import { config } from '../../config'
import { formatConcentration, formatRelative, stationLabel } from '../../utils/formatters'
import { extentOf, type BoundsTuple } from '../../utils/geo'
import { bandKey } from '../../utils/pm25Bands'
import { estimateIcon, stationIcon } from './markers'

interface AirQualityMapProps {
  onMapReady: (map: L.Map) => void
  /** Pixels covered by the details drawer (right on desktop, bottom on mobile). */
  drawerInset: { right: number; bottom: number }
  allowEstimates?: boolean
}

function MapBridge({ onMapReady, focus, inset, home, homeKey }: {
  onMapReady: (map: L.Map) => void
  focus: [number, number] | null
  inset: { right: number; bottom: number }
  home: BoundsTuple
  /** Changes when the view should be re-framed (new city, or its stations first arrive). */
  homeKey: string
}) {
  const map = useMap()
  useEffect(() => onMapReady(map), [map, onMapReady])
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize())
    ro.observe(map.getContainer())
    return () => ro.disconnect()
  }, [map])
  useEffect(() => {
    map.fitBounds(home, { padding: [48, 48], maxZoom: 13 })
    // Only re-frame on homeKey changes, not on every data refresh.
  }, [map, homeKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (focus) map.panInside(focus, { paddingTopLeft: [32, 32], paddingBottomRight: [inset.right + 32, inset.bottom + 32] })
  }, [map, focus, inset.right, inset.bottom])
  return null
}

function ClickToEstimate({ onEstimate }: { onEstimate: (lat: number, lon: number) => void }) {
  useMapEvents({ click: (e) => onEstimate(e.latlng.lat, e.latlng.lng) })
  return null
}

export function AirQualityMap({ onMapReady, drawerInset, allowEstimates = true }: AirQualityMapProps) {
  const { city, stationList, estimates, layers, selection, select, requestEstimate, hiddenBands } = useApp()
  const visible = (value: number | null) => !hiddenBands.includes(bandKey(value))

  const focus = useMemo<[number, number] | null>(() => {
    if (!selection) return null
    const item = selection.kind === 'station' ? stationList.find((s) => s.id === selection.id) : estimates.find((e) => e.id === selection.id)
    return item ? [item.latitude, item.longitude] : null
  }, [selection, stationList, estimates])

  return (
    <MapContainer
      center={city.center}
      zoom={city.zoom}
      minZoom={8}
      maxZoom={17}
      className="map"
      zoomControl={false}
      keyboard
    >
      <TileLayer url={config.tiles.url} attribution={config.tiles.attribution} maxNativeZoom={16} />
      {config.tiles.labelsUrl && <TileLayer url={config.tiles.labelsUrl} maxNativeZoom={16} />}
      <MapBridge
        onMapReady={onMapReady}
        focus={focus}
        inset={drawerInset}
        home={extentOf(stationList, city.bounds)}
        homeKey={`${city.id}:${stationList.length > 0}`}
      />
      {allowEstimates && <ClickToEstimate onEstimate={requestEstimate} />}

      {layers.stations &&
        stationList.map((s) => {
          const selected = selection?.kind === 'station' && selection.id === s.id
          if (!visible(s.value) && !selected) return null
          const label = `${stationLabel(s)}, measured ${s.value === null ? 'value unavailable' : `${formatConcentration(s.value)} ${s.unit}`}`
          return (
            // react-leaflet doesn't update title/alt after creation, so the key includes the value.
            <Marker
              key={`${s.id}:${s.value}`}
              position={[s.latitude, s.longitude]}
              icon={stationIcon(s, selected)}
              title={label}
              alt={label}
              zIndexOffset={selected ? 1000 : 0}
              eventHandlers={{ click: () => select({ kind: 'station', id: s.id }) }}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <strong>{stationLabel(s)}</strong>
                <br />
                Measured · {s.value === null ? 'unavailable' : `${formatConcentration(s.value)} ${s.unit}`}
                <br />
                <span className="tip-muted">{s.timestamp ? formatRelative(s.timestamp) : 'no timestamp'}</span>
              </Tooltip>
            </Marker>
          )
        })}

      {allowEstimates &&
        layers.estimates &&
        estimates.map((e) => {
          const selected = selection?.kind === 'estimate' && selection.id === e.id
          const v = e.result?.data.value ?? null
          if (e.status === 'ready' && !visible(v) && !selected) return null
          const u = e.result?.data.uncertainty
          const text =
            e.status === 'loading' ? 'requesting…' : e.status === 'error' ? 'request failed' : v === null ? 'no estimate available' : `${formatConcentration(v)} µg/m³`
          return (
            <Marker
              key={`${e.id}:${e.status}:${v}`}
              position={[e.latitude, e.longitude]}
              icon={estimateIcon(e, selected)}
              title={`Model estimate, ${text}`}
              alt={`Model estimate, ${text}`}
              zIndexOffset={selected ? 1000 : 500}
              eventHandlers={{ click: () => select({ kind: 'estimate', id: e.id }) }}
            >
              <Tooltip direction="top" offset={[0, -12]}>
                <strong>Model estimate</strong>
                <br />
                {text}
                {u?.lower != null && u.upper != null && (
                  <>
                    <br />
                    <span className="tip-muted">
                      Interval {formatConcentration(u.lower)}–{formatConcentration(u.upper)}
                    </span>
                  </>
                )}
              </Tooltip>
            </Marker>
          )
        })}
    </MapContainer>
  )
}
