import { Check, Copy, Diamond, LineChart, LocateFixed, RadioTower, Trash2, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useApp } from '../../app/appContext'
import { hrefFor } from '../../app/navigation'
import { config, type CityConfig, type DataMode } from '../../config'
import type { Station } from '../../types/api'
import type { Estimate } from '../../types/app'
import { formatConcentration, formatCoordinate, formatDateTime, formatRelative, isStale, stationLabel } from '../../utils/formatters'
import { nearest } from '../../utils/geo'
import { bandFor } from '../../utils/pm25Bands'
import { seriesStats, toSeries, windowSeries } from '../../utils/series'
import { KIND_ADJECTIVE } from '../../utils/stationKind'
import { ScaleBar } from '../common/ScaleBar'
import { Sparkline } from '../common/Sparkline'
import { ErrorState, LoadingState } from '../common/States'
import { ModeBadge, SourceBadge } from '../common/StatusBadge'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

const Unavailable = ({ why }: { why: string }) => <span className="muted">Unavailable — {why}</span>

function Reading({ value, unit }: { value: number | null; unit: string }) {
  const band = bandFor(value)
  return (
    <div className="reading-card" style={{ '--band': band?.color ?? 'var(--band-none)' } as CSSProperties}>
      <div className="reading">
        <span className="reading-value">{formatConcentration(value)}</span>
        {value !== null && <span className="reading-unit">{unit}</span>}
        {band && (
          <span className="band-chip" title="Concentration band (CPCB 24-h breakpoints)">
            {band.label}
          </span>
        )}
      </div>
      <ScaleBar value={value} showLabels />
    </div>
  )
}

function inCity(city: CityConfig, lat: number, lon: number) {
  const [[s, w], [n, e]] = city.bounds
  return lat >= s && lat <= n && lon >= w && lon <= e
}

function StationBody({ station, mode }: { station: Station; mode?: DataMode }) {
  const hasHistory = !!station.history?.some((p) => p.value !== null)
  const series = toSeries(station.history)
  const last24 = series.length ? windowSeries(series, series[series.length - 1].t, '24h') : []
  const stats24 = seriesStats(last24)
  const stale = station.timestamp !== null && isStale(station.timestamp, config.staleAfterMinutes)
  return (
    <>
      <div className="drawer-badges">
        <SourceBadge kind={station.source_type} />
        <ModeBadge mode={mode} />
      </div>
      <Reading value={station.value} unit={station.unit} />
      <p className="drawer-explain">
        {station.value === null
          ? 'This station has no valid reading in the latest data. No value is substituted.'
          : station.source_type === 'modelled'
            ? `Modelled PM2.5 at this station's location (${station.data_source ?? 'atmospheric model'}). It is not a sensor reading.`
            : 'Measured concentration of fine particulate matter (PM2.5) at this monitoring station.'}
      </p>
      {stale && <p className="notice notice-warn">This observation is {formatRelative(station.timestamp)} — it may not reflect current conditions.</p>}
      {stats24.count > 1 && (
        <div className="trend-card">
          <div className="trend-text">
            <span className="eyebrow">Last 24 h · {KIND_ADJECTIVE[station.source_type]}</span>
            <span className="trend-range">
              {formatConcentration(stats24.min)}–{formatConcentration(stats24.max)} <span className="muted">µg/m³</span>
            </span>
            <span className="muted small">{stats24.count} observations</span>
          </div>
          <Sparkline points={last24} width={132} height={44} />
        </div>
      )}
      <dl className="field-list">
        <Field label="Observed at">
          {station.timestamp ? (
            <>
              {formatDateTime(station.timestamp)} <span className="muted">({formatRelative(station.timestamp)})</span>
            </>
          ) : (
            <Unavailable why="no timestamp supplied" />
          )}
        </Field>
        <Field label="Coordinates">{formatCoordinate(station.latitude, station.longitude)}</Field>
        <Field label="Data source">{station.data_source ?? <Unavailable why="not supplied" />}</Field>
        <Field label="Station ID">
          <code>{station.id}</code>
        </Field>
      </dl>
      {hasHistory ? (
        <a className="btn btn-secondary btn-block" href={hrefFor('analytics')}>
          <LineChart size={15} aria-hidden="true" /> View historical trend
        </a>
      ) : (
        <p className="muted small">No historical record is available for this station.</p>
      )}
    </>
  )
}

function EstimateBody({ estimate }: { estimate: Estimate }) {
  const { city, stationList, retryEstimate, removeEstimate } = useApp()
  const outside = !inCity(city, estimate.latitude, estimate.longitude)
  const remove = (
    <button type="button" className="btn btn-ghost btn-block" onClick={() => removeEstimate(estimate.id)}>
      <Trash2 size={15} aria-hidden="true" /> Remove this point
    </button>
  )

  if (estimate.status === 'loading') return <LoadingState title="Requesting model estimate…" compact />
  if (estimate.status === 'error' || !estimate.result) {
    return (
      <>
        <ErrorState compact title="Estimate unavailable" message={estimate.error} onRetry={() => retryEstimate(estimate.id)} />
        {remove}
      </>
    )
  }

  const { data, mode } = estimate.result
  const u = data.uncertainty
  const near = nearest(estimate, stationList.filter((s) => s.value !== null))

  return (
    <>
      <div className="drawer-badges">
        <SourceBadge kind="estimated" />
        <ModeBadge mode={mode} />
      </div>
      <Reading value={data.value} unit={data.unit} />
      <p className="drawer-explain">
        {data.value === null
          ? 'The model returned no estimate for this location. No value is substituted.'
          : 'Model-based estimate for a location without a monitoring station. It is not a measurement and carries uncertainty.'}
      </p>
      {outside && <p className="notice notice-warn">This point is outside the configured {city.name} area; the model may not have been validated here.</p>}
      <dl className="field-list">
        <Field label="Uncertainty">
          {u && u.lower != null && u.upper != null ? (
            <>
              {formatConcentration(u.lower)}–{formatConcentration(u.upper)} {data.unit}
              {u.confidence_level != null && ` (${Math.round(u.confidence_level * 100)}% interval)`}
            </>
          ) : u && u.std != null ? (
            `± ${formatConcentration(u.std)} ${data.unit} (1 s.d.)`
          ) : (
            <Unavailable why="not supplied by the model" />
          )}
        </Field>
        <Field label="Estimate generated">{data.timestamp ? formatDateTime(data.timestamp) : <Unavailable why="no timestamp supplied" />}</Field>
        <Field label="Input observations">
          {data.observation_timestamp ? formatDateTime(data.observation_timestamp) : <Unavailable why="not reported by the API" />}
        </Field>
        <Field label="Model version">{data.model_version ?? <Unavailable why="not supplied" />}</Field>
        <Field label="Coordinates">{formatCoordinate(data.location.latitude, data.location.longitude)}</Field>
        <Field label="Nearest station">
          {near ? (
            <>
              {stationLabel(near.point)} <span className="muted">· {near.distanceKm.toFixed(1)} km</span>
            </>
          ) : (
            <Unavailable why="no reporting stations" />
          )}
        </Field>
      </dl>
      {remove}
    </>
  )
}

function DrawerActions({ lat, lon, onZoomTo }: { lat: number; lon: number; onZoomTo: (lat: number, lon: number) => void }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (e.g. insecure context) — nothing to do */
    }
  }
  return (
    <div className="drawer-actions">
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onZoomTo(lat, lon)}>
        <LocateFixed size={14} aria-hidden="true" /> Zoom to
      </button>
      <button type="button" className="btn btn-secondary btn-sm" onClick={copy} aria-live="polite">
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy coordinates'}
      </button>
    </div>
  )
}

interface LocationDetailsDrawerProps {
  onClose: () => void
  onZoomTo: (lat: number, lon: number) => void
}

export function LocationDetailsDrawer({ onClose, onZoomTo }: LocationDetailsDrawerProps) {
  const { selectedStation, selectedEstimate, stations } = useApp()
  const open = !!(selectedStation || selectedEstimate)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const title = selectedStation
    ? stationLabel(selectedStation)
    : selectedEstimate
      ? (selectedEstimate.result?.data.location.name ?? 'Unnamed location')
      : ''

  return (
    <aside className={`drawer ${open ? 'is-open' : ''}`} aria-label="Selected location details" aria-hidden={!open} inert={!open}>
      {open && (
        <>
          <header className="drawer-header">
            <span className={`drawer-icon ${selectedStation ? '' : 'is-estimate'}`} aria-hidden="true">
              {selectedStation ? <RadioTower size={16} /> : <Diamond size={16} />}
            </span>
            <div className="drawer-heading">
              <p className="eyebrow">{selectedStation ? 'Monitoring station' : 'Estimated location'}</p>
              <h2 className="drawer-title">{title}</h2>
            </div>
            <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close details">
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <div className="drawer-body">
            {(selectedStation ?? selectedEstimate) && (
              <DrawerActions
                lat={(selectedStation ?? selectedEstimate)!.latitude}
                lon={(selectedStation ?? selectedEstimate)!.longitude}
                onZoomTo={onZoomTo}
              />
            )}
            {selectedStation ? (
              <StationBody station={selectedStation} mode={stations.data?.mode} />
            ) : selectedEstimate ? (
              <EstimateBody estimate={selectedEstimate} />
            ) : null}
          </div>
        </>
      )}
    </aside>
  )
}
