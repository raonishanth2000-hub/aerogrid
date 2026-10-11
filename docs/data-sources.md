# AeroGrid Data Sources Provenance & Cleaning Standards

## 1. Ground Monitoring Station Network
AeroGrid integrates observations from 38 reference-grade Continuous Ambient Air Quality Monitoring Stations (CAAQMS) deployed across Delhi National Capital Region (NCR):
- **Central Pollution Control Board (CPCB)**
- **Delhi Pollution Control Committee (DPCC)**
- **India Meteorological Department (IMD)**

### Station Metadata Catalog
Stored in [`data/stations.json`](file:///Users/vedant/Downloads/aerogrid-main/data/stations.json) and populated from real sensor coordinates.

---

## 2. Ingestion & Quality Control Pipeline
The pipeline implemented in [`data/ingest.py`](file:///Users/vedant/Downloads/aerogrid-main/data/ingest.py) applies strict quality assurance:
1. **Deduplication**: Resolves multiple sensor readings per hourly window by station ID and timestamp.
2. **Physical Boundary Checks**: Flags PM2.5 readings < 1 µg/m³ or > 1000 µg/m³ as sensor noise or telemetry errors.
3. **Staleness Tracking**: Observations older than 180 minutes are dynamically flagged as `stale` to avoid misleading municipal responders.
4. **Normalized Units**: All particulate concentrations are normalized to micrograms per cubic meter (µg/m³) at standard temperature and pressure.

---

## 3. Atmospheric Feature Formulation
Raw atmospheric readings are combined with geospatial features:
- **Haversine Distance to Nearest Active Station**
- **Inverse Distance Weighted (IDW) Particulate Index**
- **Diurnal Atmospheric Cycle Factors** (solar hour sine/cosine for boundary layer height modeling)
- **Topographical Elevation** (meters above sea level)
