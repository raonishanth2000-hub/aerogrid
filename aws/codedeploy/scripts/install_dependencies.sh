#!/usr/bin/env bash
set -e

echo "=== [CodeDeploy Hook: AfterInstall] Setting up Python Environment ==="
cd /opt/aerogrid

if [ ! -d "/opt/aerogrid/venv" ]; then
    python3 -m venv /opt/aerogrid/venv
fi

source /opt/aerogrid/venv/bin/activate
pip install --upgrade pip
pip install -r /opt/aerogrid/backend/requirements.txt

echo "Dependencies successfully installed in /opt/aerogrid/venv"
