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
- The API reports `source_type: "modelled"` (Delhi's `data_kind` in `aerogrid/config.py`) and drops future rows.
- The website labels stations "Modelled", not "Measured".

**Keeping it current.** A saved CAMS file holds *forecasts* for hours that were still in the future
when it was downloaded. Once those hours pass, the forecasts look like observations, but they can
be far off: one stale file showed 39.9 µg/m³ when CAMS later reported 67.5. So
`python -m aerogrid.refresh_cams` rebuilds the last 7 days from Open-Meteo and keeps only hours
that have passed. The API runs it automatically when Delhi's newest row is more than about an
hour old; it tries at most once every 15 minutes and keeps serving the old file if the request
fails. Set `CAMS_AUTO_REFRESH=0` to turn this off.

Station names and coordinates are real CPCB, DPCC and IMD sites. The pollutant values are not
those stations' readings.

## Real sensor data: Bengaluru, OpenAQ

`data/bengaluru_openaq_2025.csv` holds real hourly PM2.5 measurements for 15 stations from
[OpenAQ](https://openaq.org) for 2025. It was downloaded with `python -m aerogrid.fetch_data`,
which needs `OPENAQ_API_KEY`.

It is served as its own city (`?city=bengaluru`), labelled "Measured", with its own model in
`models/bengaluru/`. The data ends on 31 Dec 2025, so Bengaluru estimates are made for the last
hour with station data; the API reports that hour as `observation_timestamp`.

## Adding a city

1. Get a dataset with the same columns as `data/training_dataset.csv`. For real sensors, use
   `CENTER_LAT=… CENTER_LON=… python -m aerogrid.fetch_data`.
2. Register the city in `CITIES` in `aerogrid/config.py`: its centre, dataset, model folder and
   `data_kind` ("measured" or "modelled").
3. Run `python -m aerogrid.train --city <id>` and `python -m aerogrid.experiments --city <id> --publish`.

The website's city selector lists it automatically, via `GET /api/cities`.

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
