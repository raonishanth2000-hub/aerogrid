// ─────────────────────────────────────────────────────────────────────────────
// DEMO DATA — SYNTHETIC, FOR UI DEVELOPMENT ONLY.
//
// Sites are illustrative ("Demo Site A" …) at arbitrary coordinates inside the
// configured city; they do not correspond to real monitoring stations. Every
// concentration, timestamp and interval below is generated, not observed or
// modelled. The UI labels everything from this file as DEMO DATA.
//
// Used only when VITE_DATA_MODE=mock. In API mode this file is never loaded.
// ─────────────────────────────────────────────────────────────────────────────

import type { HistoryPoint, PredictionResponse, Station } from '../types/api'
import { haversineKm } from '../utils/geo'

interface DemoSite {
  letter: string
  latitude: number
  longitude: number
  level: number
  /** Hours of history to generate. */
  historyHours: number
  /** Hours between observations (to exercise irregular records). */
  stepHours: number
  offline?: boolean
  lagHours?: number
}

const SITES: DemoSite[] = [
  { letter: 'A', latitude: 28.655, longitude: 77.305, level: 1.3, historyHours: 720, stepHours: 1 },
  { letter: 'B', latitude: 28.625, longitude: 77.235, level: 1.1, historyHours: 720, stepHours: 1 },
  { letter: 'C', latitude: 28.565, longitude: 77.18, level: 1.0, historyHours: 720, stepHours: 1 },
  { letter: 'D', latitude: 28.68, longitude: 77.125, level: 1.15, historyHours: 720, stepHours: 1 },
  { letter: 'E', latitude: 28.6, longitude: 77.075, level: 0.95, historyHours: 336, stepHours: 1 },
  { letter: 'F', latitude: 28.735, longitude: 77.115, level: 1.2, historyHours: 720, stepHours: 3 },
  { letter: 'G', latitude: 28.53, longitude: 77.27, level: 1.1, historyHours: 720, stepHours: 1 },
  { letter: 'H', latitude: 28.72, longitude: 77.18, level: 1.25, historyHours: 72, stepHours: 1 },
  { letter: 'J', latitude: 28.59, longitude: 77.225, level: 0.85, historyHours: 720, stepHours: 1 },
  { letter: 'K', latitude: 28.815, longitude: 77.1, level: 1.2, historyHours: 720, stepHours: 1, lagHours: 6 },
  { letter: 'L', latitude: 28.575, longitude: 76.94, level: 1.0, historyHours: 0, stepHours: 1, offline: true },
  { letter: 'M', latitude: 28.7, longitude: 77.27, level: 1.3, historyHours: 720, stepHours: 1 },
]

const HOUR = 3_600_000

/** Deterministic PRNG so the demo is stable across reloads. */
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function demoHistory(site: DemoSite, seed: number, end: number): HistoryPoint[] {
  const rand = prng(seed)
  const out: HistoryPoint[] = []
  for (let h = site.historyHours; h >= 0; h -= site.stepHours) {
    const t = end - h * HOUR
    const hour = new Date(t).getHours()
    const diurnal = 1 + 0.4 * Math.cos(((hour - 6) / 24) * 2 * Math.PI) + 0.2 * Math.cos(((hour - 22) / 12) * 2 * Math.PI)
    const synoptic = 1 + 0.3 * Math.sin((h / 24 / 6) * 2 * Math.PI + seed)
    const v = 65 * site.level * diurnal * synoptic * (0.85 + rand() * 0.3)
    out.push({ timestamp: new Date(t).toISOString(), value: rand() < 0.02 ? null : Math.round(v * 10) / 10 })
  }
  return out
}

export function demoStations(): Station[] {
  const now = Math.floor(Date.now() / HOUR) * HOUR
  return SITES.map((site, i) => {
    const history = site.offline ? [] : demoHistory(site, i + 1, now - (site.lagHours ?? 0) * HOUR)
    const latest = [...history].reverse().find((p) => p.value !== null)
    return {
      id: `demo-site-${site.letter.toLowerCase()}`,
      name: `Demo Site ${site.letter}`,
      latitude: site.latitude,
      longitude: site.longitude,
      pollutant: 'PM2.5',
      value: latest?.value ?? null,
      unit: 'µg/m³',
      source_type: 'measured',
      timestamp: latest?.timestamp ?? null,
      data_source: 'Demo fixture (synthetic)',
      history,
    }
  })
}

/** Inverse-distance weighting stands in for the model in demo mode. */
export function demoPrediction(latitude: number, longitude: number): PredictionResponse {
  const reporting = demoStations().filter((s) => s.value !== null)
  const ranked = reporting.map((s) => ({ s, d: haversineKm({ latitude, longitude }, s) })).sort((a, b) => a.d - b.d)
  let wSum = 0
  let vSum = 0
  for (const { s, d } of ranked) {
    const w = 1 / Math.max(d, 0.25) ** 2
    wSum += w
    vSum += w * (s.value as number)
  }
  // Points far outside the demo network get no estimate, to exercise the "unavailable" state.
  const tooFar = (ranked[0]?.d ?? Infinity) > 25
  const value = tooFar || wSum === 0 ? null : Math.round((vSum / wSum) * 10) / 10
  const half = Math.round((8 + (ranked[0]?.d ?? 0) * 2) * 10) / 10
  return {
    location: { name: null, latitude, longitude },
    pollutant: 'PM2.5',
    value,
    unit: 'µg/m³',
    source_type: 'estimated',
    timestamp: new Date().toISOString(),
    uncertainty: value === null ? null : { lower: Math.max(0, Math.round((value - half) * 10) / 10), upper: Math.round((value + half) * 10) / 10, confidence_level: 0.9 },
    model_version: 'demo-idw',
    observation_timestamp: ranked[0]?.s.timestamp ?? null,
  }
}
