#!/usr/bin/env bash
set -uo pipefail

python -m uvicorn backend.main:app --host 0.0.0.0 --port 5001 &
backend_pid=$!

npm run dev -- --host 0.0.0.0 --port 5000 &
frontend_pid=$!

cleanup() {
  kill "$backend_pid" "$frontend_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait -n "$backend_pid" "$frontend_pid"
status=$?
cleanup
wait "$backend_pid" "$frontend_pid" 2>/dev/null || true
exit "$status"