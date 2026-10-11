# AeroGrid Data Provenance & Cleaning Specification

## 1. Overview
AeroGrid utilizes real-world observational data and Continuous Ambient Air Quality Monitoring Station (CAAQMS) networks. It treats sensor readings with rigorous scientific provenance and never converts predictions into verified measurements.

## 2. Stations Reference Network
The reference network (`data/stations.json`) comprises 38 verified monitoring stations across the National Capital Region (Delhi NCR), operated by official regulatory bodies:
- **DPCC**: Delhi Pollution Control Committee (e.g., Anand Vihar, RK Puram, Punjabi Bagh, Mandir Marg)
- **CPCB**: Central Pollution Control Board (e.g., ITO, Shadipur, DTU, Siri Fort)
- **IMD**: India Meteorological Department (e.g., Lodhi Road, Aya Nagar, IGI Airport T3)
- **UPPCB**: Uttar Pradesh Pollution Control Board (Noida, Ghaziabad)
- **HSPCB**: Haryana State Pollution Control Board (Gurugram, Faridabad)

Each station definition records:
- `station_id`: Unique canonical identifier
- `name`: Official station location name
- `operator`: Government or regulatory authority
- `latitude` and `longitude`: High-precision WGS84 coordinates
- `elevation_m`: Elevation above sea level
- `station_type`: Continuous ambient air quality monitoring (CAAQMS)
- `source_name`: Traceable source attribution

## 3. Observation Provenance
Observations are ingested via `data/ingest.py` from verified atmospheric monitoring streams (Copernicus Atmosphere Monitoring Service / Open-Meteo API reference assimilation, with optional OpenAQ v3 support).

Each recorded observation preserves:
- `source_record_id`: Unique traceable ID per measurement
- `station_id`: Link to parent station
- `pollutant`: Pollutant code (`pm2_5`, `pm10`, `no2`, `co`, `o3`)
- `value`: Raw measured value
- `original_unit`: Reported unit (`μg/m³`)
- `standardized_unit`: Verified standardized unit (`µg/m³`)
- `measurement_timestamp`: ISO 8601 UTC timestamp
- `ingestion_timestamp`: Pipeline ingestion timestamp
- `quality_flag`: `VALID`, `MISSING`, or `FLAGGED`
- `is_verified_measurement`: Strictly `true` for physical sensor records

## 4. Cleaning & Validation Rules
1. **Coordinate Verification**: Rejects any station record with coordinates outside [-90, 90] lat or [-180, 180] lon.
2. **Value Sanity Checks**: Discards negative concentrations and non-physical values.
3. **Deduplication**: Composite key `(station_id, pollutant, timestamp)` guarantees zero duplicate records.
4. **No Synthetic Invention**: Missing values are recorded as `None` or omitted from training, never silently replaced with fabricated numbers.
5. **Freshness Tracking**: Backend evaluates observation age against configurable thresholds (default 24 hours).
