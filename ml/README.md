> **Experimental — not used by the AeroGrid API or website.** The served model is built by the
> `aerogrid/` package (`python -m aerogrid.train`, validated with `python -m aerogrid.experiments`).
>
> Known issues with this folder:
> - It does not run: `ml/geo.py` imports `backend.app.config` (the `backend/` package was never
>   committed) and `ml/evaluate.py` imports a `build_dataset` function that does not exist.
> - The metrics in `ml/artifacts/metrics.json` (R² 0.95) were computed on the Delhi dataset, which is
>   CAMS model output from Open-Meteo, not sensor measurements. Nearest-station copying scores
>   almost the same there because stations share CAMS grid cells, so these numbers say how well a
>   model interpolates the CAMS field, not real-world accuracy.

# AeroGrid ML System: Spatial Air-Quality Interpolation

## 1. Problem Formulation
Monitoring stations are spatially discrete and sparse. When an urban planner or researcher queries an unmonitored location $(x, y)$, standard AQI displays either:
1. Fallaciously display the nearest station reading regardless of distance (which can be tens of kilometers away), or
2. Invent unvalidated figures.

AeroGrid formulates this as a spatial interpolation problem with strict target-leakage prevention and spatial cross-validation.

## 2. Models Evaluated
1. **Nearest Station Baseline**: Serves the nearest active station reading as the estimate.
2. **Inverse Distance Weighting (IDW, $p=2$) Baseline**: Classical geostatistical interpolation weighted by inverse squared distance.
3. **Spatial Random Forest Regressor (Primary)**:
   - Uses WGS84 coordinates, elevation, cyclical temporal features ($\sin/\cos$ hour, $\sin/\cos$ day of week).
   - Dynamic spatial lag features derived from active contextual stations (distance to nearest station, nearest station reading, IDW estimate, regional mean/std, station density within 10 km).

## 3. Evaluation Methodology
- **Validation Strategy**: 5-Fold Spatial Station Cross-Validation.
- **Whole-Station Holdout**: All observations from test stations are held out simultaneously. The model is trained purely on the remaining station network.
- **Leakage Prevention**: Spatial lag features on training folds exclude the target station itself.
- **Metrics Computed**:
  - Mean Absolute Error (MAE)
  - Root Mean Squared Error (RMSE)
  - Mean Bias Error (Bias)
  - Coefficient of Determination ($R^2$)

## 4. Defensible Uncertainty Interval
AeroGrid does not fabricate confidence bounds. Uncertainty is computed using:
$$\text{Margin}_{95\%} = 1.96 \cdot \sigma_{\text{residual}} \cdot \left(1 + 0.05 \cdot d_{\text{nearest\_km}}\right)$$
where $\sigma_{\text{residual}}$ is the empirical standard error calculated during held-out cross-validation, scaled proportionally by distance to the nearest physical station.
