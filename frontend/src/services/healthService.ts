import type { DataMode } from '../config'
import type { ApiResult, HealthResponse } from '../types/api'
import { parseHealth } from '../utils/validation'
import { demoDelay, getJson, wrap } from './api'

export async function fetchHealth(mode: DataMode, signal?: AbortSignal): Promise<ApiResult<HealthResponse>> {
  if (mode === 'mock') {
    await demoDelay(signal, 150)
    return wrap({ status: 'ok' }, 'mock')
  }
  return wrap(await getJson('/api/health', parseHealth, { signal, timeoutMs: 8_000 }), 'api')
}
