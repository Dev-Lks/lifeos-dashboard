#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
PORT="${1:-${PORT:-8700}}"
echo "Starting AgentOS Mission Control on http://127.0.0.1:${PORT}"
exec python3 server.py "$PORT"
