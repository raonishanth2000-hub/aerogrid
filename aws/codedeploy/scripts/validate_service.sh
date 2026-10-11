#!/usr/bin/env bash
set -e

echo "=== [CodeDeploy Hook: ValidateService] Performing Health Check ==="
MAX_RETRIES=15
WAIT_SECONDS=3
ENDPOINT="http://localhost:8000/api/health"

for i in $(seq 1 $MAX_RETRIES); do
    echo "Attempt $i/$MAX_RETRIES: Checking $ENDPOINT ..."
    RESPONSE=$(curl -s -m 5 "$ENDPOINT" || true)
    if echo "$RESPONSE" | grep -q '"status":"ok"'; then
        echo "AeroGrid backend is healthy and responding successfully:"
        echo "$RESPONSE"
        exit 0
    fi
    sleep $WAIT_SECONDS
done

echo "Error: Service health check failed after $MAX_RETRIES attempts."
exit 1
