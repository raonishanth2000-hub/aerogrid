interface SegmentedProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string; disabled?: boolean; title?: string }>
  onChange: (value: T) => void
}

/** Single-choice segmented control (radio group semantics). */
export function Segmented<T extends string>({ label, value, options, onChange }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          className={o.value === value ? 'is-active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
