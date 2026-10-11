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

function city(id: string, name: string, lat: number, lon: number, zoom = 11): CityConfig {
  return { id, name, center: [lat, lon], zoom, bounds: [[lat - 0.22, lon - 0.25], [lat + 0.22, lon + 0.25]] }
}

/**
 * Cities with map framing. In mock mode every city is available with synthetic DEMO data, so the
 * UI can be tested across air-quality levels. In API mode the backend's GET /api/cities decides
 * which cities are offered (each has its own station data and model); see availableCities().
 */
export const CITIES: CityConfig[] = [
  { ...city('delhi', 'Delhi', 28.6139, 77.209), bounds: [[28.4, 76.84], [28.88, 77.35]] },
  city('mumbai', 'Mumbai', 19.076, 72.8777),
  city('bengaluru', 'Bengaluru', 12.9716, 77.5946),
  city('kolkata', 'Kolkata', 22.5726, 88.3639),
  city('chennai', 'Chennai', 13.0827, 80.2707),
  city('lucknow', 'Lucknow', 26.8467, 80.9462),
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

const apiBaseUrl =
  (env.VITE_API_BASE_URL ?? '').trim().replace(/\/+$/, '') ||
  // In local development the FastAPI backend runs on port 8000 by default.
  (env.DEV ? 'http://localhost:8000' : '')

export const config = {
  /** Mode the app starts in; viewers can switch at runtime when a backend URL is available. */
  initialDataMode: resolveMode(),
  apiBaseUrl,
  /** The "AeroGrid model" data source needs a backend to call. */
  modelModeAvailable: apiBaseUrl !== '',
  // Delhi: the study area the current model is trained and validated on.
  defaultCityId: (env.VITE_DEFAULT_CITY ?? '').trim().toLowerCase() || 'delhi',
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

/**
 * Cities the selector may offer in the given data mode. In API mode these are the cities the
 * backend reports (`apiCities`), framed with the built-in map settings where known; until that
 * list has loaded, only the default city is offered.
 */
export function availableCities(mode: DataMode, apiCities?: readonly { id: string; name: string; latitude: number; longitude: number }[]): CityConfig[] {
  if (mode === 'mock') return CITIES
  if (!apiCities?.length) return [cityById(config.defaultCityId)]
  return apiCities.map((c) => CITIES.find((known) => known.id === c.id) ?? city(c.id, c.name, c.latitude, c.longitude))
}
