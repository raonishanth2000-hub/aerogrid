import type { ApiResult, PredictionResponse } from './api'

/** A location the user asked the model to estimate during this session. */
export interface Estimate {
  id: string
  latitude: number
  longitude: number
  requestedAt: string
  status: 'loading' | 'ready' | 'error'
  result?: ApiResult<PredictionResponse>
  error?: string
}

export type Selection = { kind: 'station'; id: string } | { kind: 'estimate'; id: string } | null

export interface MapLayers {
  stations: boolean
  estimates: boolean
}

export type TimeRange = '24h' | '7d' | '30d'
