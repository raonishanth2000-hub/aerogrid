// Shared Recharts styling. SVG presentation attributes can't resolve CSS
// variables, so token values are read from the document at render time.

function token(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function chartTheme() {
  const t = {
    border: token('--border', '#22304a'),
    borderStrong: token('--border-strong', '#2e3f5f'),
    text: token('--text', '#e6edf7'),
    text2: token('--text-2', '#a9b6cc'),
    text3: token('--text-3', '#8592ab'),
    accent: token('--accent', '#38bdf8'),
    warn: token('--warn', '#f5b04a'),
    surface2: token('--surface-2', '#17223a'),
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
      { color: token('--series-1', '#38bdf8'), dash: undefined },
      { color: token('--series-2', '#f5b04a'), dash: '6 3' },
      { color: token('--series-3', '#c084fc'), dash: '2 3' },
      { color: token('--series-4', '#4ade80'), dash: '10 3 2 3' },
    ],
  }
}
