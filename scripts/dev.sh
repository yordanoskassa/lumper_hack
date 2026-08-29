#!/usr/bin/env bash
# One command to run the whole demo: backend (FastAPI) + frontend (Vite).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/backend"
if [ ! -d .venv ]; then
  /opt/homebrew/bin/python3.12 -m venv .venv || python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8787 &
BACK=$!

cd "$ROOT/frontend"
[ -d node_modules ] || npm install
npm run dev &
FRONT=$!

trap 'kill $BACK $FRONT 2>/dev/null || true' EXIT
echo "Backend  → http://127.0.0.1:8787/api/health"
echo "Frontend → http://127.0.0.1:5180"
wait
