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

/** Measured / modelled station values vs AeroGrid estimates — shape + text, never colour alone. */
export function SourceBadge({ kind }: { kind: 'measured' | 'modelled' | 'estimated' }) {
  if (kind === 'modelled') {
    return (
      <span className="badge badge-modelled" title="Values from an atmospheric model at the station location, not a sensor reading">
        <span className="glyph glyph-circle" aria-hidden="true" />
        Modelled
      </span>
    )
  }
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
