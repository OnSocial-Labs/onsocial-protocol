#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "Upgrading JavaScript dependencies..."

# Ensure pnpm-store directory exists and has correct permissions
mkdir -p /app/.pnpm-store
chown -R node:node /app/.pnpm-store
chmod -R 775 /app/.pnpm-store

# Process root package
echo "Checking dependencies for root..."
if ! ncu -j; then
  echo -e "${RED}ncu -j failed for root. Error details above.${NC}"
  exit 1
fi
echo "Upgrading dependencies for root..."
ncu -u || { echo -e "${RED}Failed to upgrade dependencies for root${NC}"; exit 1; }
echo -e "${GREEN}Dependencies updated in package.json${NC}"

# Regenerate pnpm-lock.yaml to match updated dependencies
echo "Regenerating pnpm-lock.yaml..."
pnpm install --no-frozen-lockfile --store-dir=/app/.pnpm-store || { echo -e "${RED}Failed to regenerate pnpm-lock.yaml${NC}"; exit 1; }
echo -e "${GREEN}pnpm-lock.yaml regenerated successfully${NC}"

# Validate workspace packages
for pkg in packages/onsocial-js packages/onsocial-app packages/relayer; do
  if [ -d "$pkg" ]; then
    echo "Validating $pkg..."
    pnpm --dir $pkg install --frozen-lockfile --store-dir=/app/.pnpm-store || { echo -e "${RED}Failed to validate $pkg${NC}"; exit 1; }
    echo -e "${GREEN}$pkg validated successfully${NC}"
  else
    echo -e "${RED}Directory $pkg not found${NC}"
    exit 1
  fi
done

echo -e "${GREEN}All dependencies upgraded and validated successfully${NC}"
