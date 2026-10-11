# AeroGrid API (FastAPI + trained PM2.5 model). Build from the repository root:
#   docker build -t aerogrid-backend .
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-api.txt .
RUN pip install -r requirements-api.txt

COPY aerogrid/ aerogrid/
COPY models/ models/
COPY data/training_dataset.csv data/geo_cache.json data/

RUN useradd --create-home --uid 1000 aerogrid && chown -R aerogrid:aerogrid /app
USER aerogrid

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/health || exit 1

CMD ["uvicorn", "aerogrid.api:app", "--host", "0.0.0.0", "--port", "8000"]
