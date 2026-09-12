#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ -x apps/backend/photo-check/.venv/bin/python ]]; then
  exec apps/backend/photo-check/.venv/bin/python scripts/start_saved.py
fi
exec python3 scripts/start_saved.py
