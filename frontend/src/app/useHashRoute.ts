import { useEffect, useState } from 'react'
import { routeFromHash, type RouteId } from './navigation'

/** Minimal hash router: `#/analytics` → 'analytics'. Back/forward work; no dependency needed. */
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      setRoute(routeFromHash(window.location.hash))
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
