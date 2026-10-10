import { config } from '../config'
import type { ApiResult, MetricsResponse } from '../types/api'
import { parseMetrics } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export async function fetchMetrics(signal?: AbortSignal): Promise<ApiResult<MetricsResponse>> {
  if (config.dataMode === 'mock') {
    const { demoMetricsResponse } = await import('../data/demoMetrics')
    await demoDelay(signal)
    return wrap(demoMetricsResponse, 'mock')
  }
  return wrap(await getJson('/api/metrics', parseMetrics, { signal }), 'api')
}
