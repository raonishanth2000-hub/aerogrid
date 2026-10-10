import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseHealth } from '../utils/validation'
import { ApiError, getJson } from './api'

const BASE = 'http://backend.test'

function mockFetch(impl: typeof fetch) {
  vi.stubGlobal('fetch', vi.fn(impl))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('getJson', () => {
  it('returns parsed data on success', async () => {
    mockFetch(async () => new Response(JSON.stringify({ status: 'ok' }), { status: 200 }))
    await expect(getJson('/api/health', parseHealth, { baseUrl: BASE })).resolves.toEqual({ status: 'ok' })
  })

  it('surfaces HTTP errors with the backend detail message', async () => {
    mockFetch(async () => new Response(JSON.stringify({ detail: 'Model not loaded' }), { status: 503 }))
    const err = await getJson('/api/health', parseHealth, { baseUrl: BASE }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('http')
    expect(err.status).toBe(503)
    expect(err.message).toBe('Model not loaded')
  })

  it('reports network failures', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })
    const err = await getJson('/api/health', parseHealth, { baseUrl: BASE }).catch((e) => e)
    expect(err.kind).toBe('network')
  })

  it('reports malformed JSON and unexpected shapes', async () => {
    mockFetch(async () => new Response('<html>', { status: 200 }))
    expect((await getJson('/api/health', parseHealth, { baseUrl: BASE }).catch((e) => e)).kind).toBe('parse')
    mockFetch(async () => new Response(JSON.stringify({ nope: true }), { status: 200 }))
    expect((await getJson('/api/health', parseHealth, { baseUrl: BASE }).catch((e) => e)).kind).toBe('shape')
  })

  it('times out slow requests', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const err = await getJson('/api/health', parseHealth, { baseUrl: BASE, timeoutMs: 20 }).catch((e) => e)
    expect(err.kind).toBe('timeout')
  })

  it('distinguishes caller cancellation from timeouts', async () => {
    mockFetch(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const controller = new AbortController()
    const pending = getJson('/api/health', parseHealth, { baseUrl: BASE, signal: controller.signal }).catch((e) => e)
    controller.abort()
    expect((await pending).kind).toBe('aborted')
  })

  it('refuses to call when no base URL is configured', async () => {
    const err = await getJson('/api/health', parseHealth, { baseUrl: '' }).catch((e) => e)
    expect(err.kind).toBe('config')
  })
})
