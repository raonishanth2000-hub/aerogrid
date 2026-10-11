#!/usr/bin/env bash
set -e

echo "=== [CodeDeploy Hook: BeforeInstall] Validating System Environment ==="
which python3 || { echo "Python 3 is required but not installed."; exit 1; }
which curl || { echo "curl is required for health validation."; exit 1; }

echo "Python version: $(python3 --version)"
mkdir -p /opt/aerogrid
mkdir -p /var/log/aerogrid

echo "Environment validation passed."
