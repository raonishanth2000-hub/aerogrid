# AeroGrid Demonstration & Judge-Facing Walkthrough Script

## 1. Introduction (0:00 - 0:45)
- **Problem**: Fixed air quality stations only monitor isolated points, leaving major urban blind spots. Simple distance weighting fails during winter atmospheric inversions.
- **Solution**: AeroGrid blends real-time ground observations, spatial Random Forest inference with calibrated 95% uncertainty bounds, and AWS-managed automated delivery.

---

## 2. Interactive GIS Workspace (0:45 - 2:00)
1. **Explore Map**:
   - Open `#explore` view. Notice 38 verified CAAQMS stations across Delhi NCR with live CPCB NAQI color codes.
   - Point-click on an unmonitored zone (e.g. Narela Industrial area).
   - Point estimate triggers `/api/v1/predict` returning estimated PM2.5 and calibrated 95% confidence intervals.
2. **Freshness Tracking**:
   - Stations older than 180 minutes are flagged with amber `Stale` badges, preventing outdated data from driving emergency action.

---

## 3. Model Lab & Genuine Spatial Benchmarks (2:00 - 3:15)
1. Navigate to `#model-lab`.
2. Inspect the benchmark table:
   - Compares Spatial Random Forest ($R^2 = 0.951$, $\text{RMSE} = 7.29$) against Inverse Distance Weighting and Nearest Station baselines.
   - Highlights held-out station test results (Anand Vihar, Punjabi Bagh, Dwarka).

---

## 4. Operational Resilience & CI/CD (3:15 - 4:00)
1. **AWS AppConfig**: Show dynamic threshold adjustment without restarting backend servers.
2. **AWS CodePipeline & CodeBuild**: Walk through the automated pipeline validating tests and containerizing the release.
3. **AWS CodeDeploy**: Highlight zero-downtime Blue/Green deployments protected by `/api/v1/health/readiness` health probes.
