import { Cpu, FlaskConical } from 'lucide-react'
import { useApp } from '../../app/appContext'
import { config, type DataMode } from '../../config'

const OPTIONS: Array<{ mode: DataMode; label: string; icon: typeof Cpu; help: string }> = [
  { mode: 'mock', label: 'Demo data', icon: FlaskConical, help: 'Synthetic fixtures for exploring the interface — not real measurements' },
  { mode: 'api', label: 'AeroGrid model', icon: Cpu, help: 'Real station data and the trained AeroGrid model, served by the backend API' },
]

/** Lets viewers choose between demo fixtures and the real model backend. */
export function DataSourceSwitch({ compact = false }: { compact?: boolean }) {
  const { dataMode, setDataMode } = useApp()
  return (
    <div className={`source-switch ${compact ? 'is-compact' : ''}`} role="radiogroup" aria-label="Data source">
      {OPTIONS.map(({ mode, label, icon: Icon, help }) => {
        const disabled = mode === 'api' && !config.modelModeAvailable
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={dataMode === mode}
            disabled={disabled}
            className={`source-option ${dataMode === mode ? 'is-active' : ''} ${mode === 'mock' ? 'is-demo' : 'is-model'}`}
            title={disabled ? 'No backend URL is configured for this build (VITE_API_BASE_URL)' : help}
            onClick={() => setDataMode(mode)}
          >
            <Icon size={14} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
