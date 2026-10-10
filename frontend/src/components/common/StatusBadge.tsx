import type { DataMode } from '../../config'

export function DemoBadge({ label = 'DEMO DATA' }: { label?: string }) {
  return (
    <span className="badge badge-demo" title="Synthetic fixture data for development — not real measurements or model output">
      {label}
    </span>
  )
}

/** Shows a DEMO marker only when the data came from fixtures. */
export function ModeBadge({ mode }: { mode: DataMode | undefined }) {
  return mode === 'mock' ? <DemoBadge label="DEMO" /> : null
}

/** Measured vs estimated — shape + text, never colour alone. */
export function SourceBadge({ kind }: { kind: 'measured' | 'estimated' }) {
  return kind === 'measured' ? (
    <span className="badge badge-measured">
      <span className="glyph glyph-circle" aria-hidden="true" />
      Measured
    </span>
  ) : (
    <span className="badge badge-estimated">
      <span className="glyph glyph-diamond" aria-hidden="true" />
      Model estimate
    </span>
  )
}
