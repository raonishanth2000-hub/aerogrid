import { Eye, EyeOff } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useApp } from '../app/appContext'
import { Panel } from '../components/common/Panel'
import { EmptyState, ErrorState, LoadingState } from '../components/common/States'
import { PageHeader } from '../components/layout/PageHeader'
import { ActualVsPredictedChart } from '../components/model/ActualVsPredictedChart'
import { BaselineComparison } from '../components/model/BaselineComparison'
import { ModelInfo, ModelMetrics } from '../components/model/ModelMetrics'
import { ValidationExplanation } from '../components/model/ValidationExplanation'
import type { MetricsResponse } from '../types/api'
import { hasEvaluationResults } from '../utils/validation'

export function ModelPerformancePage() {
  const { metrics, dataMode } = useApp()
  const [preview, setPreview] = useState(false)
  const [illustrative, setIllustrative] = useState<MetricsResponse | null>(null)

  useEffect(() => {
    if (preview && !illustrative) import('../data/demoMetrics').then((m) => setIllustrative(m.illustrativeMetrics))
  }, [preview, illustrative])

  const real = metrics.data?.data
  const m = preview ? illustrative : hasEvaluationResults(real) ? real : null
  const mode = preview ? 'mock' : metrics.data?.mode
  const hasBaselines = !!m?.baselines?.some((b) => b.mae !== null || b.rmse !== null)
  const heldOut = m?.held_out_predictions ?? []

  const previewToggle =
    dataMode === 'mock' ? (
      <button type="button" className="btn btn-secondary btn-sm" aria-pressed={preview} onClick={() => setPreview((p) => !p)}>
        {preview ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
        {preview ? 'Hide layout preview' : 'Preview layout with placeholder numbers'}
      </button>
    ) : undefined

  let content
  if (!preview && metrics.status === 'loading' && !metrics.data) content = <LoadingState title="Loading evaluation results…" />
  else if (!preview && metrics.status === 'error' && !metrics.data)
    content = <ErrorState title="Could not load model metrics" message={metrics.error.message} onRetry={metrics.reload} />
  else if (!m)
    content = (
      <EmptyState
        title="Model evaluation results are not available yet."
        message="They will appear once the validation pipeline has completed."
      />
    )
  else
    content = (
      <>
        <ModelMetrics m={m} />
        <ModelInfo m={m} />
      </>
    )

  return (
    <div className="page">
      <PageHeader
        title="Model Performance"
        subtitle="How well the model predicts PM2.5 at monitoring stations it was not trained on."
        actions={previewToggle}
      />
      {preview && (
        <div className="illustrative-banner" role="note">
          <strong>Illustrative layout preview.</strong> The numbers below are placeholders for reviewing the page design. They are
          not evaluation results and say nothing about model accuracy.
        </div>
      )}

      <div className={preview ? 'is-illustrative' : ''}>
        <Panel id="metrics" title="Evaluation metrics" subtitle="Held-out stations · errors in µg/m³" mode={mode}>
          {content}
        </Panel>

        {m && (
          <div className="grid-2">
            <Panel id="baselines" title="Baseline comparison" subtitle="Only methods the backend reports as evaluated" mode={mode}>
              {hasBaselines ? (
                <BaselineComparison m={m} />
              ) : (
                <EmptyState compact title="No baseline results reported" message="Nearest-station and IDW baselines will appear here once evaluated." />
              )}
            </Panel>
            <Panel id="scatter" title="Actual vs predicted" subtitle="Held-out station observations" mode={mode}>
              {heldOut.length ? (
                <ActualVsPredictedChart points={heldOut} />
              ) : (
                <EmptyState compact title="Held-out predictions not provided" message="The API has not supplied per-observation validation results." />
              )}
            </Panel>
          </div>
        )}
      </div>

      <Panel id="validation" title="How the model is validated">
        <ValidationExplanation />
      </Panel>
    </div>
  )
}
