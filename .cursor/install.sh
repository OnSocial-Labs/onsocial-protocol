#!/usr/bin/env bash
# Idempotent Cloud Agent bootstrap after checkout.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

corepack enable
corepack prepare pnpm@10.32.1 --activate
pnpm install --frozen-lockfile
