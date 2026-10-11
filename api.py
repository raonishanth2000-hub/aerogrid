"""REST API Backend for AeroGrid.

Provides standard HTTP JSON endpoints for external frontend applications
(React, Vue, Next.js, mobile apps, or custom dashboards).
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from aerogrid.config import MODEL_DIR
from aerogrid.predict import predict_location

app = FastAPI(
    title="AeroGrid Air Quality Prediction API",
    description="Backend API serving ML-based PM2.5 and PM10 predictions for frontend clients.",
    version="1.0.0",
)

# Enable CORS so frontend applications (running on localhost:3000, 5173, etc.) can query without restrictions
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PredictionRequest(BaseModel):
    pollutant: str = Field("pm25", description="Target pollutant: 'pm25' or 'pm10'")
    latitude: float = Field(..., description="Target latitude (e.g. 12.9716)")
    longitude: float = Field(..., description="Target longitude (e.g. 77.5946)")
    timestamp: Optional[str] = Field(
        None, description="ISO format datetime (e.g. '2025-06-15T12:00:00'). Defaults to current time."
    )


@app.get("/")
def root():
    """Health check and API information."""
    return {
        "service": "AeroGrid Backend API",
        "status": "online",
        "docs_url": "/docs",
        "supported_pollutants": ["pm25", "pm10"],
    }


@app.get("/api/metrics/{pollutant}")
def get_model_metrics(pollutant: str):
    """Return model accuracy and validation metrics for the specified pollutant."""
    p = "pm25" if "2" in pollutant.lower() else "pm10"
    metrics_path = MODEL_DIR / f"{p}_metrics.json"

    if not metrics_path.exists():
        raise HTTPException(status_code=404, detail=f"Metrics for {pollutant} not found.")

    try:
        data = json.loads(metrics_path.read_text())
        return {"pollutant": p, "metrics": data}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@app.post("/api/predict")
def predict_pollution(req: PredictionRequest):
    """Estimate pollutant concentration at an unmonitored location."""
    p = "pm25" if "2" in req.pollutant.lower() else "pm10"

    if req.timestamp:
        try:
            target_dt = datetime.fromisoformat(req.timestamp.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timestamp format: '{req.timestamp}'. Use ISO format (e.g. '2025-06-15T12:00:00').",
            )
    else:
        target_dt = datetime.now()

    try:
        result = predict_location(
            pollutant=p,
            latitude=req.latitude,
            longitude=req.longitude,
            timestamp_utc=target_dt,
        )
        return {
            "status": "success",
            "pollutant": p,
            "prediction_ugm3": result.get("ml_prediction_ugm3"),
            "unit": "µg/m³",
            "target": {
                "latitude": req.latitude,
                "longitude": req.longitude,
                "timestamp": target_dt.isoformat(),
            },
            "nearest_station_distance_km": result.get("nearest_station_distance_km_used_by_model"),
            "road_density_2km": result.get("road_density_2km"),
            "dist_to_major_road_m": result.get("dist_to_major_road_m"),
            "idw_comparison": result.get("idw_comparison"),
            "model_metrics": result.get("metrics"),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {exc}")


@app.get("/api/predict")
def predict_pollution_get(
    latitude: float = Query(..., description="Latitude"),
    longitude: float = Query(..., description="Longitude"),
    pollutant: str = Query("pm25", description="Pollutant: pm25 or pm10"),
    timestamp: Optional[str] = Query(None, description="ISO timestamp (optional)"),
):
    """GET endpoint for easy frontend integration."""
    return predict_pollution(
        PredictionRequest(
            latitude=latitude,
            longitude=longitude,
            pollutant=pollutant,
            timestamp=timestamp,
        )
    )
