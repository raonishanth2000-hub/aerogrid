import { createContext, useContext } from 'react'
import type { CityConfig, DataMode, PollutantId } from '../config'
import type { Resource } from '../hooks/useResource'
import type { StationsResult } from '../services/stationsService'
import type { ApiResult, HealthResponse, MetricsResponse, Station } from '../types/api'
import type { Estimate, MapLayers, Selection, TimeRange } from '../types/app'
import type { StationKind } from '../utils/stationKind'

export interface AppState {
  dataMode: DataMode
  /** Switch between demo fixtures and the AeroGrid model backend. */
  setDataMode: (mode: DataMode) => void
  city: CityConfig
  setCityId: (id: string) => void
  pollutant: PollutantId
  setPollutant: (p: PollutantId) => void

  stations: Resource<ApiResult<StationsResult>>
  metrics: Resource<ApiResult<MetricsResponse>>
  health: Resource<ApiResult<HealthResponse>>
  refreshAll: () => void
  isRefreshing: boolean

  /** Valid stations from the latest successful load (empty while unavailable). */
  stationList: Station[]
  /** Measured sensor data or modelled values, as reported by the station data. */
  stationKind: StationKind
  latestObservation: string | null

  layers: MapLayers
  setLayers: (layers: MapLayers) => void
  /** Concentration band keys (or 'none' for unavailable) hidden via the legend. */
  hiddenBands: string[]
  toggleBand: (key: string) => void

  selection: Selection
  select: (selection: Selection) => void
  selectedStation: Station | undefined
  selectedEstimate: Estimate | undefined

  estimates: Estimate[]
  requestEstimate: (latitude: number, longitude: number) => void
  retryEstimate: (id: string) => void
  removeEstimate: (id: string) => void
  clearEstimates: () => void

  timeRange: TimeRange
  setTimeRange: (range: TimeRange) => void
  comparisonIds: string[]
  setComparisonIds: (ids: string[]) => void
}

export const AppContext = createContext<AppState | null>(null)

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside <AppStateProvider>')
  return ctx
}
