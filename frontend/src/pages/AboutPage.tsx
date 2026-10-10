import { Panel } from '../components/common/Panel'
import { SourceBadge } from '../components/common/StatusBadge'
import { EmptyState } from '../components/common/States'
import { MethodologySection } from '../components/about/MethodologySection'
import { PageHeader } from '../components/layout/PageHeader'
import { AWS_ARCHITECTURE, DATA_SOURCES, FRONTEND_ATTRIBUTION } from '../data/projectInfo'

export function AboutPage() {
  return (
    <div className="page page-about">
      <PageHeader title="About AeroGrid" subtitle="Understand air quality beyond the monitoring station." />

      <div className="grid-2">
        <Panel id="problem" title="The problem">
          <div className="prose">
            <p>
              Air-quality monitors are expensive, so cities have only a handful. Between them, people live, work and travel in places
              where PM2.5 is never directly measured.
            </p>
          </div>
        </Panel>
        <Panel id="approach" title="The approach">
          <div className="prose">
            <p>
              AeroGrid uses existing station measurements and relevant location features to estimate PM2.5 where no monitor exists,
              and reports how accurate those estimates are on stations the model never saw.
            </p>
          </div>
        </Panel>
      </div>

      <Panel id="measured-vs-estimated" title="Measured vs estimated">
        <div className="compare-kinds">
          <div className="kind-card">
            <SourceBadge kind="measured" />
            <p>
              A <strong>measurement</strong> comes from a physical monitor at that location and time. Shown as a solid circle.
            </p>
          </div>
          <div className="kind-card">
            <SourceBadge kind="estimated" />
            <p>
              An <strong>estimate</strong> is model output for a location without a monitor. It carries uncertainty and is shown as a
              dashed diamond. Estimates are never mixed into measured statistics.
            </p>
          </div>
        </div>
      </Panel>

      <Panel id="pipeline" title="Model pipeline">
        <MethodologySection />
      </Panel>

      <div className="grid-2">
        <Panel id="validation" title="Validation strategy">
          <div className="prose">
            <p>
              The model is evaluated on <strong>held-out monitoring stations</strong>: entire stations are excluded from training and
              then predicted. Because AeroGrid’s job is to estimate at unmonitored places, this is a closer test of real use than
              randomly held-out readings from stations the model already knows. Results are on the <a href="#/model">Model Performance</a> page.
            </p>
          </div>
        </Panel>
        <Panel id="architecture" title="AWS architecture">
          {AWS_ARCHITECTURE.length ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Service</th>
                  <th scope="col">Role</th>
                </tr>
              </thead>
              <tbody>
                {AWS_ARCHITECTURE.map((a) => (
                  <tr key={a.service}>
                    <th scope="row">{a.service}</th>
                    <td>{a.role}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState compact title="To be confirmed by the backend team" message="The services actually used will be listed here (edit src/data/projectInfo.ts)." />
          )}
        </Panel>
      </div>

      <div className="grid-2">
        <Panel id="sources" title="Data sources & attribution">
          {DATA_SOURCES.length ? (
            <ul className="source-list">
              {DATA_SOURCES.map((d) => (
                <li key={d.name}>
                  <strong>{d.name}</strong> — {d.description}
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Training and prediction datasets: to be confirmed by the data team.</p>
          )}
          <ul className="source-list">
            {FRONTEND_ATTRIBUTION.map((d) => (
              <li key={d.name}>
                <strong>{d.name}</strong> — {d.description}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel id="limitations" title="Limitations & responsible use">
          <div className="prose">
            <ul>
              <li>AeroGrid is a hackathon prototype. It has no official, regulatory or government status.</li>
              <li>Estimates are not a substitute for measurements and are not medical or health advice.</li>
              <li>Accuracy is known only at evaluated stations; it may differ elsewhere in the city.</li>
              <li>Concentration bands are indicative. They use 24-hour breakpoints and are not AQI values.</li>
              <li>Data can be delayed or missing; the dashboard shows observation times and flags stale data.</li>
            </ul>
          </div>
        </Panel>
      </div>
    </div>
  )
}
