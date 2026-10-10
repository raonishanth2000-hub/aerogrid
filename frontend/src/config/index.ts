// Runtime configuration from Vite env variables (see .env.example).
// Everything here is shipped to the browser — never put secrets in VITE_ variables.

export type DataMode = 'mock' | 'api'

export interface CityConfig {
  id: string
  name: string
  center: [number, number]
  zoom: number
  /** South-west and north-east corners used for "fit to city". */
  bounds: [[number, number], [number, number]]
}

/** Cities the frontend is configured for. Only add a city once the backend serves data for it. */
export const CITIES: CityConfig[] = [
  {
    id: 'delhi',
    name: 'Delhi',
    center: [28.6139, 77.209],
    zoom: 11,
    bounds: [
      [28.4, 76.84],
      [28.88, 77.35],
    ],
  },
]

export const POLLUTANTS = [{ id: 'PM2.5', label: 'PM2.5', unit: 'µg/m³' }] as const
export type PollutantId = (typeof POLLUTANTS)[number]['id']

const env = import.meta.env

function resolveMode(): DataMode {
  const raw = (env.VITE_DATA_MODE ?? '').trim().toLowerCase()
  if (raw === 'mock' || raw === 'api') return raw
  // Unset: demo fixtures in local development, real API in production builds.
  return env.DEV ? 'mock' : 'api'
}

function parseNumber(raw: string | undefined, fallback: number): number {
  const n = Number.parseFloat(raw ?? '')
  return Number.isFinite(n) ? n : fallback
}

export const config = {
  dataMode: resolveMode(),
  apiBaseUrl: (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, ''),
  defaultCityId: (env.VITE_DEFAULT_CITY ?? '').trim().toLowerCase() || CITIES[0].id,
  staleAfterMinutes: parseNumber(env.VITE_STALE_AFTER_MINUTES, 180),
  requestTimeoutMs: 15_000,
  tiles: {
    // Esri's keyless dark-grey canvas. Fine for a demo; check Esri's terms (or set VITE_TILE_URL
    // to a provider you have an agreement with) before serving production traffic.
    url:
      (env.VITE_TILE_URL ?? '').trim() ||
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    labelsUrl: (env.VITE_TILE_URL ?? '').trim()
      ? ''
      : 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
    attribution:
      (env.VITE_TILE_ATTRIBUTION ?? '').trim() ||
      'Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors',
  },
} as const

export function cityById(id: string): CityConfig {
  return CITIES.find((c) => c.id === id) ?? CITIES[0]
}
