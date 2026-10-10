export function ValidationExplanation() {
  return (
    <div className="prose">
      <p>
        AeroGrid’s purpose is to estimate PM2.5 where there is no monitor, so it is evaluated the same way: whole monitoring
        stations are held out of training, the model predicts their values, and those predictions are compared with what the
        stations actually measured. This estimates how well the model generalises to locations it has not seen.
      </p>
      <h3 className="subhead">Limitations</h3>
      <ul>
        <li>Accuracy is measured only at station locations. Areas unlike any station (e.g. far from roads, or near unusual sources) may behave differently.</li>
        <li>With a small number of stations, metrics can change noticeably depending on which stations are held out.</li>
        <li>Metrics describe average performance over the evaluation period, not every hour or every neighbourhood.</li>
        <li>Baseline comparisons are only meaningful when every method was evaluated on the same held-out split.</li>
      </ul>
    </div>
  )
}
