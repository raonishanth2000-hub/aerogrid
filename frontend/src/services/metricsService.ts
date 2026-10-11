import type { DataMode } from '../config'
import type { ApiResult, MetricsResponse } from '../types/api'
import { parseMetrics } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export async function fetchMetrics(mode: DataMode, cityId: string, signal?: AbortSignal): Promise<ApiResult<MetricsResponse>> {
  if (mode === 'mock') {
    const { demoMetricsResponse } = await import('../data/demoMetrics')
    await demoDelay(signal)
    return wrap(demoMetricsResponse, 'mock')
  }
  return wrap(await getJson(`/api/metrics?${new URLSearchParams({ city: cityId })}`, parseMetrics, { signal }), 'api')
}
