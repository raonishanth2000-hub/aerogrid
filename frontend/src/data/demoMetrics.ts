// ─────────────────────────────────────────────────────────────────────────────
// DEMO METRICS
//
// `demoMetricsResponse` is what mock mode returns from /api/metrics: every
// metric is null, because no model has been evaluated. The Model Performance
// page therefore shows its "results not available yet" state in mock mode.
//
// `illustrativeMetrics` exists only so the page layout can be reviewed. It is
// shown behind an explicit "Preview layout" toggle, under a banner stating the
// numbers are illustrative and NOT evaluation results. Never present these
// values as model performance.
// ─────────────────────────────────────────────────────────────────────────────

import type { MetricsResponse } from '../types/api'

export const demoMetricsResponse: MetricsResponse = {
  model_name: null,
  model_version: null,
  evaluation_method: null,
  sample_count: null,
  mae: null,
  rmse: null,
  bias: null,
  r2: null,
}

function illustrativeScatter(): NonNullable<MetricsResponse['held_out_predictions']> {
  const pts = []
  let seed = 7
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 60; i++) {
    const actual = 25 + rand() * 180
    pts.push({ station_name: `Illustrative ${String.fromCharCode(65 + (i % 12))}`, actual: Math.round(actual), predicted: Math.round(actual + (rand() - 0.5) * 50) })
  }
  return pts
}

export const illustrativeMetrics: MetricsResponse = {
  model_name: 'Illustrative model',
  model_version: 'layout-preview',
  evaluation_method: 'Illustrative — no evaluation has been run',
  sample_count: 60,
  mae: 15,
  rmse: 20,
  bias: 1,
  r2: 0.7,
  baselines: [
    { method: 'Nearest station', mae: 22, rmse: 30, bias: 3 },
    { method: 'IDW interpolation', mae: 18, rmse: 25, bias: 2 },
  ],
  held_out_predictions: illustrativeScatter(),
}
