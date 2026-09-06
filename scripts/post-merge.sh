#!/usr/bin/env bash
set -euo pipefail

# Reconcile JavaScript dependencies changed by an isolated task, then verify
# the merged application before workflow reconciliation restarts the preview.
npm install --no-audit --no-fund
npm run build