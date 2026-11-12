#!/usr/bin/env bash
# Production server for Playwright. next/font downloads Google CSS at build
# time; a bad response makes the loader throw (null[1]) and the job goes red
# before any test runs. Retry the build, then start.
set -euo pipefail

port="${E2E_PORT:-3099}"
cd "$(dirname "$0")/.."

pnpm run build:deps

ok=0
for attempt in 1 2 3; do
  if pnpm exec next build --webpack; then
    ok=1
    break
  fi
  echo "next build failed (attempt ${attempt}); retrying…"
  sleep $((attempt * 5))
done

if [[ "$ok" != 1 ]]; then
  echo "next build failed after 3 attempts"
  exit 1
fi

exec pnpm exec next start --port "$port"
