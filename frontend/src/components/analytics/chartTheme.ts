// Shared Recharts styling. SVG presentation attributes can't resolve CSS
// variables, so token values are read from the document at render time.

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function chartTheme() {
  const t = {
    border: token('--border', '#262d38'),
    borderStrong: token('--border-strong', '#343d4b'),
    text: token('--text', '#e6e9ee'),
    text2: token('--text-2', '#adb5c2'),
    text3: token('--text-3', '#8b95a5'),
    accent: token('--accent', '#4ba6e2'),
    warn: token('--warn', '#d29922'),
    surface2: token('--surface-2', '#1c222b'),
  }
  return {
    ...t,
    axis: { stroke: t.borderStrong, tick: { fill: t.text3, fontSize: 11 }, tickLine: false },
    grid: { stroke: t.border },
    tooltip: {
      contentStyle: { background: t.surface2, border: `1px solid ${t.borderStrong}`, borderRadius: 8, fontSize: 12, color: t.text },
      labelStyle: { color: t.text2, marginBottom: 4 },
      itemStyle: { color: t.text },
    },
    series: [
      { color: token('--series-1', '#4ba6e2'), dash: undefined },
      { color: token('--series-2', '#d29922'), dash: '6 3' },
      { color: token('--series-3', '#a371f7'), dash: '2 3' },
      { color: token('--series-4', '#3fb950'), dash: '10 3 2 3' },
    ],
  }
}
