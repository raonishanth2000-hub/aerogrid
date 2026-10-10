const EARTH_RADIUS_KM = 6371

export interface LatLon {
  latitude: number
  longitude: number
}

export function haversineKm(a: LatLon, b: LatLon): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function nearest<T extends LatLon>(target: LatLon, points: T[]): { point: T; distanceKm: number } | null {
  let best: { point: T; distanceKm: number } | null = null
  for (const p of points) {
    const d = haversineKm(target, p)
    if (!best || d < best.distanceKm) best = { point: p, distanceKm: d }
  }
  return best
}

/**
 * Distance from each station to its nearest neighbouring station. A purely
 * geometric description of network density — not a measure of model error.
 */
export function nearestNeighbourDistances<T extends LatLon & { id: string }>(points: T[]): Array<{ point: T; distanceKm: number }> {
  return points.flatMap((p) => {
    const n = nearest(
      p,
      points.filter((q) => q.id !== p.id),
    )
    return n ? [{ point: p, distanceKm: n.distanceKm }] : []
  })
}

export function median(values: number[]): number | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}
