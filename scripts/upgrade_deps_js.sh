#!/bin/bash
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo "Upgrading JavaScript dependencies..."

# Define packages (root and packages/*)
PACKAGES=("root")
for pkg in packages/*; do
    [ -d "$pkg" ] && [ -f "$pkg/package.json" ] && PACKAGES+=($(basename "$pkg"))
done

# Process each package
for pkg in "${PACKAGES[@]}"; do
    echo "Checking dependencies for $pkg..."
    if [ "$pkg" = "root" ]; then
        ncu -j 2>/dev/null || { echo -e "${RED}ncu -j failed for $pkg${NC}"; exit 1; }
        echo "Upgrading dependencies for $pkg..."
        ncu -u && pnpm install --no-frozen-lockfile || { echo -e "${RED}Failed to upgrade dependencies for $pkg${NC}"; exit 1; }
    else
        cd "packages/$pkg" || { echo -e "${RED}Failed to change to $pkg directory${NC}"; exit 1; }
        ncu -j 2>/dev/null || { echo -e "${RED}ncu -j failed for $pkg${NC}"; exit 1; }
        echo "Upgrading dependencies for $pkg..."
        ncu -u && pnpm install --no-frozen-lockfile || { echo -e "${RED}Failed to upgrade dependencies for $pkg${NC}"; exit 1; }
        cd ../..
    fi
    echo -e "${GREEN}Dependencies processed for $pkg${NC}"
done

echo -e "${GREEN}All dependencies upgraded successfully${NC}"