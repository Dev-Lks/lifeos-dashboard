#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-${PORT:-8700}}"
export PORT
echo "Starting ATLAS LifeOS on http://127.0.0.1:${PORT}"
exec python3 -m server.main
