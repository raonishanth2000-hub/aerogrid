import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { cityById, config, type PollutantId } from '../config'
import { useResource } from '../hooks/useResource'
import { isAbortError } from '../services/api'
import { fetchHealth } from '../services/healthService'
import { fetchMetrics } from '../services/metricsService'
import { fetchPrediction } from '../services/predictionService'
import { fetchStations } from '../services/stationsService'
import type { Estimate, MapLayers, Selection, TimeRange } from '../types/app'
import { latestTime } from '../utils/formatters'
import { AppContext, type AppState } from './appContext'

const MAX_ESTIMATES = 30
let estimateSeq = 0

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [cityId, setCityId] = useState(config.defaultCityId)
  const stationsFetcher = useCallback((signal: AbortSignal) => fetchStations(cityId, signal), [cityId])
  const stations = useResource(stationsFetcher)
  const metrics = useResource(fetchMetrics)
  const health = useResource(fetchHealth)

  const [pollutant, setPollutant] = useState<PollutantId>('PM2.5')
  const [layers, setLayers] = useState<MapLayers>({ stations: true, estimates: true })
  const [selection, setSelection] = useState<Selection>(null)
  const [estimates, setEstimates] = useState<Estimate[]>([])
  const [timeRange, setTimeRange] = useState<TimeRange>('7d')
  const [comparisonIds, setComparisonIds] = useState<string[]>([])
  const [hiddenBands, setHiddenBands] = useState<string[]>([])
  const inflight = useRef(new Map<string, AbortController>())

  useEffect(() => {
    const map = inflight.current
    return () => map.forEach((c) => c.abort())
  }, [])

  const stationList = useMemo(() => stations.data?.data.stations ?? [], [stations.data])
  const latestObservation = useMemo(() => latestTime(stationList.map((s) => s.timestamp)), [stationList])

  const runEstimate = useCallback((id: string, lat: number, lon: number) => {
    inflight.current.get(id)?.abort()
    const controller = new AbortController()
    inflight.current.set(id, controller)
    fetchPrediction(lat, lon, cityId, controller.signal).then(
      (result) => setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'ready', result, error: undefined } : e))),
      (err: unknown) => {
        if (isAbortError(err)) return
        const message = err instanceof Error ? err.message : String(err)
        setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'error', error: message } : e)))
      },
    ).finally(() => {
      if (inflight.current.get(id) === controller) inflight.current.delete(id)
    })
  }, [cityId])

  const requestEstimate = useCallback(
    (latitude: number, longitude: number) => {
      const id = `estimate-${++estimateSeq}`
      setEstimates((prev) => {
        const next = [...prev, { id, latitude, longitude, requestedAt: new Date().toISOString(), status: 'loading' as const }]
        for (const old of next.slice(0, Math.max(0, next.length - MAX_ESTIMATES))) inflight.current.get(old.id)?.abort()
        return next.slice(-MAX_ESTIMATES)
      })
      setSelection({ kind: 'estimate', id })
      setLayers((l) => (l.estimates ? l : { ...l, estimates: true }))
      runEstimate(id, latitude, longitude)
    },
    [runEstimate],
  )

  const retryEstimate = useCallback(
    (id: string) => {
      const e = estimates.find((x) => x.id === id)
      if (!e) return
      setEstimates((prev) => prev.map((x) => (x.id === id ? { ...x, status: 'loading', error: undefined } : x)))
      runEstimate(id, e.latitude, e.longitude)
    },
    [estimates, runEstimate],
  )

  const removeEstimate = useCallback((id: string) => {
    inflight.current.get(id)?.abort()
    setEstimates((prev) => prev.filter((x) => x.id !== id))
    setSelection((s) => (s?.kind === 'estimate' && s.id === id ? null : s))
  }, [])

  const { reload: reloadStations } = stations
  const { reload: reloadMetrics } = metrics
  const { reload: reloadHealth } = health
  const clearEstimates = useCallback(() => {
    inflight.current.forEach((c) => c.abort())
    inflight.current.clear()
    setEstimates([])
    setSelection((s) => (s?.kind === 'estimate' ? null : s))
  }, [])

  const toggleBand = useCallback((key: string) => {
    setHiddenBands((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }, [])

  const refreshAll = useCallback(() => {
    reloadStations()
    reloadMetrics()
    reloadHealth()
  }, [reloadStations, reloadMetrics, reloadHealth])

  // Selections, estimates and comparisons belong to one city, so they are cleared on change.
  const changeCity = useCallback((id: string) => {
    inflight.current.forEach((c) => c.abort())
    inflight.current.clear()
    setCityId(id)
    setSelection(null)
    setEstimates([])
    setComparisonIds([])
  }, [])

  const selectedStation = selection?.kind === 'station' ? stationList.find((s) => s.id === selection.id) : undefined
  const selectedEstimate = selection?.kind === 'estimate' ? estimates.find((e) => e.id === selection.id) : undefined

  const value: AppState = {
    dataMode: config.dataMode,
    city: cityById(cityId),
    setCityId: changeCity,
    pollutant,
    setPollutant,
    stations,
    metrics,
    health,
    refreshAll,
    isRefreshing: stations.status === 'loading' || metrics.status === 'loading' || health.status === 'loading',
    stationList,
    latestObservation,
    layers,
    setLayers,
    hiddenBands,
    toggleBand,
    selection,
    select: setSelection,
    selectedStation,
    selectedEstimate,
    estimates,
    requestEstimate,
    retryEstimate,
    removeEstimate,
    clearEstimates,
    timeRange,
    setTimeRange,
    comparisonIds,
    setComparisonIds,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}
