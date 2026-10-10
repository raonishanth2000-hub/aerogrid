import { useCallback, useEffect, useState } from 'react'
import { isAbortError } from '../services/api'

export type ResourceState<T> =
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: Error }

export type Resource<T> = ResourceState<T> & { reload: () => void }

/**
 * Fetches on mount and on `reload()`. In-flight requests are aborted when a new
 * one starts or the component unmounts. The last good data is kept during a
 * reload so the UI doesn't flash empty. `fetcher` must be a stable reference.
 */
export function useResource<T>(fetcher: (signal: AbortSignal) => Promise<T>): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' })
  const [nonce, setNonce] = useState(0)

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
