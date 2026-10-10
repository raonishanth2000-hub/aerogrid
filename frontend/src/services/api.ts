import { config, type DataMode } from '../config'
import type { ApiResult } from '../types/api'
import { ResponseShapeError } from '../utils/validation'

export type ApiErrorKind = 'config' | 'network' | 'timeout' | 'http' | 'parse' | 'shape' | 'aborted'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status?: number

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof ApiError && err.kind === 'aborted'
}

interface GetJsonOptions {
  signal?: AbortSignal
  timeoutMs?: number
  baseUrl?: string
}

/**
 * GETs JSON from the AeroGrid backend and runs it through `parse`.
 * Network failures, timeouts, HTTP errors and malformed bodies all become ApiError.
 */
export async function getJson<T>(path: string, parse: (body: unknown) => T, opts: GetJsonOptions = {}): Promise<T> {
  const baseUrl = opts.baseUrl ?? config.apiBaseUrl
  if (!baseUrl) throw new ApiError('config', 'No backend URL configured. Set VITE_API_BASE_URL.')

  const controller = new AbortController()
  let timedOut = false
  const timer = globalThis.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, opts.timeoutMs ?? config.requestTimeoutMs)
  const onAbort = () => controller.abort()
  opts.signal?.addEventListener('abort', onAbort)

  let res: Response
  try {
    res = await fetch(`${baseUrl}${path}`, { headers: { Accept: 'application/json' }, signal: controller.signal })
  } catch (err) {
    if (timedOut) throw new ApiError('timeout', 'The AeroGrid backend did not respond in time.')
    if (controller.signal.aborted) throw new ApiError('aborted', 'Request cancelled.')
    throw new ApiError('network', `Could not reach the AeroGrid backend (${(err as Error).message}).`)
  } finally {
    globalThis.clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }

  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { detail?: unknown; message?: unknown }
      if (typeof body.detail === 'string') detail = body.detail
      else if (typeof body.message === 'string') detail = body.message
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError('http', detail || `The backend returned HTTP ${res.status}.`, res.status)
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new ApiError('parse', 'The backend returned a response that is not valid JSON.')
  }
  try {
    return parse(body)
  } catch (err) {
    if (err instanceof ResponseShapeError) throw new ApiError('shape', `Unexpected response from ${path.split('?')[0]}: ${err.message}`)
    throw err
  }
}

export function wrap<T>(data: T, mode: DataMode): ApiResult<T> {
  return { data, mode, receivedAt: new Date().toISOString() }
}

/** Emulates network latency for demo fixtures so loading states are exercised; honours aborts. */
export function demoDelay(signal?: AbortSignal, ms = 300): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = globalThis.setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      globalThis.clearTimeout(t)
      reject(new ApiError('aborted', 'Request cancelled.'))
    })
  })
}
