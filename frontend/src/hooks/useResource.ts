import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '../services/api'

export type ResourceState<T> =
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: Error }

export type Resource<T> = ResourceState<T> & { reload: () => void }

/**
 * Fetches on mount, on `reload()` and whenever `fetcher` changes. In-flight
 * requests are aborted when a new one starts or the component unmounts.
 * A manual reload keeps the last good data so the UI doesn't flash empty; a new
 * `fetcher` (e.g. another city) clears it so stale data is never shown as current.
 * `fetcher` must be memoised.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)
  const [activeFetcher, setActiveFetcher] = useState(() => fetcher)

  if (activeFetcher !== fetcher) {
    setActiveFetcher(() => fetcher)
    setState({ status: 'loading' })
  }

  useEffect(() => {
    const controller = new AbortController()
    fetcher(controller.signal).then(
      (data) => setState({ status: 'success', data }),
      (err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return
        setState((prev) => ({ status: 'error', data: prev.data, error: err instanceof Error ? err : new Error(String(err)) }))
      },
    )
    return () => controller.abort()
  }, [fetcher, nonce])

  const reload = useCallback(() => {
    setState((prev) => ({ status: 'loading', data: prev.data }))
    setNonce((n) => n + 1)
  }, [])

  return { ...state, reload }
}
