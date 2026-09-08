#!/usr/bin/env bash
set -euo pipefail

python -m venv services/api/.venv
source services/api/.venv/bin/activate
pip install -r services/api/requirements.txt
pip install -e services/decision_engine
pip install -e services/learning_engine

echo "Run: cd services/api && uvicorn app.main:app --reload"
