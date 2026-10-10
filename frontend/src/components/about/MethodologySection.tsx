const STEPS = [
  { title: 'Data collection', text: 'Gather PM2.5 measurements from monitoring stations, plus location-related features the model can use.' },
  { title: 'Preprocessing', text: 'Clean records, remove invalid readings, align timestamps and attach features to each observation.' },
  { title: 'Baselines', text: 'Establish simple reference methods — nearest station and inverse-distance weighting — to beat.' },
  { title: 'Training', text: 'Fit the machine-learning model on observations from the training stations.' },
  { title: 'Evaluation', text: 'Predict at held-out stations and compare with what they measured (MAE, RMSE, bias).' },
  { title: 'Prediction', text: 'Serve estimates for arbitrary coordinates through the API, labelled as model output.' },
]

export function MethodologySection() {
  return (
    <ol className="pipeline">
      {STEPS.map((s, i) => (
        <li key={s.title} className="pipeline-step">
          <span className="pipeline-num" aria-hidden="true">
            {i + 1}
          </span>
          <div>
            <h3 className="pipeline-title">{s.title}</h3>
            <p className="pipeline-text">{s.text}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
