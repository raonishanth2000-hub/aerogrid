#!/usr/bin/env bash
set -e

echo "=== [CodeDeploy Hook: ApplicationStart] Starting AeroGrid Backend Service ==="
cd /opt/aerogrid

source /opt/aerogrid/venv/bin/activate
export PYTHONPATH=/opt/aerogrid
export APP_ENV=production
export PORT=8000

# Stop any lingering previous instances
pkill -f "uvicorn aerogrid.api:app" || true

nohup /opt/aerogrid/venv/bin/uvicorn aerogrid.api:app \
  --host 0.0.0.0 \
  --port 8000 \
  --workers 2 \
  > /var/log/aerogrid/backend.log 2>&1 &

echo "AeroGrid backend process spawned (PID: $!)."
