# Model evaluation

Reproduce with:

```bash
GEO_OFFLINE=1 python -m aerogrid.experiments --pollutant pm25 --publish
```

## Method

**Grouped 5-fold spatial cross-validation.** Every station is held out once, so the model is always
scored on stations it never saw. A random row split would leak each station's own history into
training and overstate accuracy.

**Baselines.** Each model is compared on the same folds with three simple methods:
- the training median, a constant;
- copying the nearest station;
- inverse-distance weighting (IDW) of the other stations.

**Saving rule.** `--save-best` replaces `models/pm25_model.joblib` only when the candidate beats both
the current model and every baseline.

**Published file.** `--publish` writes `models/pm25_validation.json`, which `/api/metrics` and the
Model Performance page read.

## Current results: Delhi, CAMS model data

38 stations, 4,332 station-hours, 7–11 Oct 2026, PM2.5 in µg/m³. Rows dated in the future (forecasts) are
excluded.

| Method | MAE | RMSE | Bias | R² |
| --- | --- | --- | --- | --- |
| Nearest station (baseline) | **1.50** | 8.65 | +1.36 | 0.915 |
| AeroGrid model (gradient boosting) | 3.03 | 9.61 | −1.28 | 0.895 |
| IDW interpolation (baseline) | 3.19 | **7.69** | −0.48 | **0.933** |
| Training median (baseline) | 22.25 | 30.49 | −7.01 | −0.058 |

Other variants tried on the same folds, by MAE:
- residual on nearest station: 3.00
- without location identity: 3.50
- residual on IDW: 4.69

None beat the nearest-station baseline, so no new model was saved.

**Why the model doesn't beat nearest station.** The target is CAMS model output on a grid of about
40 km. Neighbouring "stations" usually sit in the same grid cell and get identical values: there are
only 2–3 distinct values per hour across all 38 stations. Copying the nearest station is therefore
almost exact. These numbers measure how well AeroGrid reproduces the CAMS field, not how accurate
it is against real air. The website shows this caveat on the Model Performance page.

## Uncertainty interval

Estimates carry an empirical 90% interval. It is calibrated from the out-of-fold ratio of actual
to predicted values, using the 5th and 95th percentiles:
- lower bound = 0.976 × estimate
- upper bound = 1.131 × estimate
- held-out coverage: 90.0%

When no calibration has been published, `uncertainty` is `null`; the API never invents a range.

## Bengaluru, real sensors (OpenAQ)

15 stations, 70,500 station-hours, 2025. Artefacts are in `models/bengaluru/`, served as `?city=bengaluru`.
Reproduce with `python -m aerogrid.experiments --city bengaluru --publish`.

| Method | MAE | RMSE | Bias | R² |
| --- | --- | --- | --- | --- |
| AeroGrid model | **13.17** | **26.05** | −3.05 | **0.068** |
| IDW interpolation | 14.59 | 28.78 | −1.20 | −0.137 |
| Training median | 14.87 | 27.42 | −4.27 | −0.032 |
| Nearest station | 17.36 | 34.13 | +0.93 | −0.600 |

On real measurements the model is the best method: its error is 10% lower than IDW. That is a
real but modest gain. Copying the nearest station is worst, because real PM2.5 varies a lot
between nearby sites. The model and these results use the same inputs:
- weather, time and neighbour readings;
- no road, elevation or aerosol values, which this dataset doesn't have (`GEO_OFFLINE=1`).

The 90% interval is wide: 0.30× to 2.87× the estimate. That is the honest spread for real
sensors. Bengaluru data ends on 31 Dec 2025, so estimates are for that hour.

An earlier version of this model (MAE 14.28) was trained with different road-feature inputs than
its validation; it was retrained so the deployed model is exactly the one evaluated.

PM10 was dropped after the same evaluation: no model beat predicting the median.
