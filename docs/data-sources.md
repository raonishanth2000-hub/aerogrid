# Data sources

## Station data in use: Delhi, CAMS model output

`data/training_dataset.csv` contains hourly PM2.5 at the coordinates of 38 Delhi monitoring
stations, listed in `data/stations.json`. The data was collected by `data/ingest.py` from the
[Open-Meteo air-quality API](https://open-meteo.com/en/docs/air-quality-api).

**The values are modelled, not measured.** Open-Meteo serves the Copernicus CAMS atmospheric model
on a grid of roughly 40 km. Asking for a station's coordinates returns the model value for that
grid cell, not the station's sensor reading. We checked this three ways:
- the values match Open-Meteo CAMS exactly;
- there are only 2–3 distinct values per hour across all 38 stations;
- 38% of the rows are dated in the future, which means they are forecasts.

**How the project handles this:**
- `data/ingest.py` labels every record `data_kind: "modelled"` and
  `is_verified_measurement: false`, and flags forecasts with `is_forecast`.
- The API reports `source_type: "modelled"` (setting `STATION_DATA_KIND`) and drops future rows.
- The website labels stations "Modelled", not "Measured".

Station names and coordinates are real CPCB, DPCC and IMD sites. The pollutant values are not
those stations' readings.

## Real sensor data: Bengaluru, OpenAQ

`data/bengaluru_openaq_2025.csv` holds real hourly PM2.5 measurements for 15 stations from
[OpenAQ](https://openaq.org) for 2025. It was downloaded with `python -m aerogrid.fetch_data`,
which needs `OPENAQ_API_KEY`.

To switch the project to real measurements:

```bash
cp data/bengaluru_openaq_2025.csv data/training_dataset.csv
export CENTER_LAT=12.9716 CENTER_LON=77.5946 STATION_DATA_KIND=measured STATION_DATA_SOURCE=OpenAQ
python -m aerogrid.train && python -m aerogrid.experiments --publish
```

## Features

**Weather** comes from the Open-Meteo forecast and archive APIs and is joined per station and hour.

**Road density and distance to major road** come from OpenStreetMap via Overpass and are cached in
`data/geo_cache.json`. Lookups that fail are recorded as unknown, never as "no roads". Set
`GEO_OFFLINE=1` to use the cache only.

**Neighbour features** are built for each row from the *other* stations at the same hour, so a
station never sees its own value.

## Quality rules

- Negative or missing values are dropped.
- Duplicates are removed by station, pollutant and hour.
- All values are in µg/m³.
- SSL certificates are always verified.
