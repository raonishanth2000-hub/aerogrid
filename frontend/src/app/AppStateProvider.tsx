import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { availableCities, config, type DataMode, type PollutantId } from '../config'
import { useResource } from '../hooks/useResource'
import { isAbortError } from '../services/api'
import { fetchCities } from '../services/citiesService'
import { fetchHealth } from '../services/healthService'
import { fetchMetrics } from '../services/metricsService'
import { fetchPrediction } from '../services/predictionService'
import { fetchStations } from '../services/stationsService'
import type { Estimate, MapLayers, Selection, TimeRange } from '../types/app'
import { latestTime } from '../utils/formatters'
import { stationKindOf } from '../utils/stationKind'
import { AppContext, type AppState } from './appContext'

const MAX_ESTIMATES = 30
const MODE_KEY = 'aerogrid.dataMode'
let estimateSeq = 0

/** The viewer's last chosen data source, if still valid; otherwise the configured default. */
function readStoredMode(): DataMode {
  try {
    const stored = localStorage.getItem(MODE_KEY)
    if (stored === 'mock' || (stored === 'api' && config.modelModeAvailable)) return stored
  } catch {
    /* storage unavailable */
  }
  return config.initialDataMode
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [dataMode, setDataModeState] = useState<DataMode>(readStoredMode)
  const [cityId, setCityId] = useState(config.defaultCityId)
  // In model mode the backend says which cities it serves; demo mode needs no request.
  const citiesFetcher = useCallback(
    (signal: AbortSignal) => (dataMode === 'api' ? fetchCities(signal) : Promise.resolve([])),
    [dataMode],
  )
  const apiCities = useResource(citiesFetcher)
  const apiCityList = apiCities.data
  const cities = useMemo(() => availableCities(dataMode, apiCityList), [dataMode, apiCityList])
  // A city chosen in demo mode may not be served by the model; fall back to the mode's default.
  const city = cities.find((c) => c.id === cityId) ?? cities.find((c) => c.id === config.defaultCityId) ?? cities[0]

  // Fetchers change with the data source, which clears stale data from the other source.
  const stationsFetcher = useCallback((signal: AbortSignal) => fetchStations(dataMode, city.id, signal), [dataMode, city.id])
  const metricsFetcher = useCallback((signal: AbortSignal) => fetchMetrics(dataMode, city.id, signal), [dataMode, city.id])
  const healthFetcher = useCallback((signal: AbortSignal) => fetchHealth(dataMode, city.id, signal), [dataMode, city.id])
  const stations = useResource(stationsFetcher)
  const metrics = useResource(metricsFetcher)
  const health = useResource(healthFetcher)

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
  const stationKind = useMemo(() => stationKindOf(stationList), [stationList])

  const runEstimate = useCallback((id: string, lat: number, lon: number) => {
    inflight.current.get(id)?.abort()
    const controller = new AbortController()
    inflight.current.set(id, controller)
    fetchPrediction(dataMode, lat, lon, city.id, controller.signal).then(
      (result) => setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'ready', result, error: undefined } : e))),
      (err: unknown) => {
        if (isAbortError(err)) return
        const message = err instanceof Error ? err.message : String(err)
        setEstimates((prev) => prev.map((e) => (e.id === id ? { ...e, status: 'error', error: message } : e)))
      },
    ).finally(() => {
      if (inflight.current.get(id) === controller) inflight.current.delete(id)
    })
  }, [dataMode, city.id])

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
  const { reload: reloadCities } = apiCities
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
    reloadCities()
    reloadStations()
    reloadMetrics()
    reloadHealth()
  }, [reloadCities, reloadStations, reloadMetrics, reloadHealth])

  // Selections, estimates and comparisons belong to one city and one data source, so they are cleared on change.
  const resetLocalState = useCallback(() => {
    inflight.current.forEach((c) => c.abort())
    inflight.current.clear()
    setSelection(null)
    setEstimates([])
    setComparisonIds([])
  }, [])

  const changeCity = useCallback(
    (id: string) => {
      resetLocalState()
      setCityId(id)
    },
    [resetLocalState],
  )

  const setDataMode = useCallback(
    (mode: DataMode) => {
      if (mode === 'api' && !config.modelModeAvailable) return
      resetLocalState()
      setDataModeState(mode)
      try {
        localStorage.setItem(MODE_KEY, mode)
      } catch {
        /* storage unavailable */
      }
    },
    [resetLocalState],
  )

  const selectedStation = selection?.kind === 'station' ? stationList.find((s) => s.id === selection.id) : undefined
  const selectedEstimate = selection?.kind === 'estimate' ? estimates.find((e) => e.id === selection.id) : undefined

  const value: AppState = {
    dataMode,
    setDataMode,
    city,
    cities,
    setCityId: changeCity,
    pollutant,
    setPollutant,
    stations,
    metrics,
    health,
    refreshAll,
    isRefreshing: stations.status === 'loading' || metrics.status === 'loading' || health.status === 'loading',
    stationList,
    stationKind,
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
