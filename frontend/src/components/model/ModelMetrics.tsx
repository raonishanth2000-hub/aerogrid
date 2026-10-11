import type { ReactNode } from 'react'
import type { MetricsResponse } from '../../types/api'
import { formatCount, formatDateTime, formatMetric, formatSigned } from '../../utils/formatters'
import { InfoTip } from '../common/Tooltip'

const METRIC_HELP = {
  mae: 'Mean Absolute Error: the average size of the prediction error, ignoring direction. Lower is better.',
  rmse: 'Root Mean Squared Error: like MAE but penalises large errors more heavily. Lower is better.',
  bias: 'Mean of (predicted − actual). Positive means the model tends to over-estimate, negative means under-estimate. Closer to zero is better.',
  r2: 'Coefficient of determination: the share of variation in the actual PM2.5 values explained by the model. 1 is perfect; 0 is no better than predicting the mean.',
}

function Tile({ label, help, value, unit }: { label: string; help: string; value: string; unit?: string }) {
  const missing = value === '—'
  return (
    <div className="kpi">
      <div className="kpi-label">
        {label}
        <InfoTip label={label}>{help}</InfoTip>
      </div>
      <div className="kpi-value">
        {value}
        {!missing && unit && <span className="kpi-unit">{unit}</span>}
      </div>
      {missing && <div className="kpi-foot muted">Not reported</div>}
    </div>
  )
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field-row">
      <dt>{label}</dt>
      <dd>{children ?? <span className="muted">Not reported</span>}</dd>
    </div>
  )
}

export function ModelInfo({ m }: { m: MetricsResponse }) {
  return (
    <dl className="field-list field-list-2col">
      <Info label="Model">{m.model_name}</Info>
      <Info label="Version">{m.model_version}</Info>
      <Info label="Training period">{m.training_period}</Info>
      <Info label="Evaluation method">{m.evaluation_method}</Info>
      <Info label="Evaluation samples">{m.sample_count !== null ? formatCount(m.sample_count) : null}</Info>
      <Info label="Last evaluated">{m.evaluated_at ? formatDateTime(m.evaluated_at) : null}</Info>
    </dl>
  )
}

export function ModelMetrics({ m }: { m: MetricsResponse }) {
  return (
    <div className="kpi-row">
      <Tile label="MAE" help={METRIC_HELP.mae} value={formatMetric(m.mae)} unit="µg/m³" />
      <Tile label="RMSE" help={METRIC_HELP.rmse} value={formatMetric(m.rmse)} unit="µg/m³" />
      <Tile label="Bias" help={METRIC_HELP.bias} value={formatSigned(m.bias)} unit="µg/m³" />
      <Tile label="R²" help={METRIC_HELP.r2} value={formatMetric(m.r2, 2)} />
    </div>
  )
}
