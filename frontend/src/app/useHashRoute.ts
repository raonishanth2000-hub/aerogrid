import { useEffect, useState } from 'react'
import { hrefFor, routeFromHash, type RouteId } from './navigation'

/** Minimal hash router: `#/analytics` → 'analytics'. Back/forward work; no dependency needed. */
export function useHashRoute(): RouteId {
  const [route, setRoute] = useState<RouteId>(() => routeFromHash(window.location.hash))

  // Unknown or removed routes (e.g. old #/map links) fall back to Overview; keep the URL in sync.
  useEffect(() => {
    if (window.location.hash !== hrefFor(route)) history.replaceState(null, '', hrefFor(route))
  }, [route])

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
