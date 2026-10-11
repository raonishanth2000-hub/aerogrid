#!/usr/bin/env bash

echo "=== [CodeDeploy Hook: ApplicationStop] Stopping Previous Backend Instances ==="
pkill -f "uvicorn backend.app.main:app" || echo "No active uvicorn instances found to terminate."
exit 0
