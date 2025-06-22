#!/bin/bash
set -e

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

echo "Upgrading JavaScript dependencies..."

# Ensure pnpm-store directory exists and has correct permissions
mkdir -p /app/.pnpm-store
chmod -R 775 /app/.pnpm-store

# Install npm-check-updates locally if not available
if ! command -v ncu &> /dev/null; then
    echo "Installing npm-check-updates locally..."
    npx npm-check-updates@latest --version > /dev/null 2>&1 || { echo -e "${ERROR}Failed to install npm-check-updates${RESET}"; exit 1; }
    NCU_CMD="npx npm-check-updates@latest"
else
    NCU_CMD="ncu"
fi

# Process root package
echo "Checking dependencies for root..."
if ! $NCU_CMD -j; then
  echo -e "${ERROR}$NCU_CMD -j failed for root. Error details above.${RESET}"
  exit 1
fi

# Check if there are any upgrades available
UPGRADES_AVAILABLE=$($NCU_CMD --format group --silent | grep -v "All dependencies match" | wc -l)

if [ "$UPGRADES_AVAILABLE" -eq 0 ]; then
    echo -e "${SUCCESS}✅ All dependencies match the latest package versions${RESET}"
    echo -e "${SUCCESS}✅ No upgrades needed${RESET}"
    exit 0
fi

if [ "$AUTO_UPGRADE" = "1" ]; then
    echo "Running automatic upgrade (non-interactive mode)..."
    $NCU_CMD -u || { echo -e "${ERROR}Failed to upgrade dependencies for root${RESET}"; exit 1; }
    echo -e "${SUCCESS}✅ Dependencies updated in package.json${RESET}"
else
    echo "The following dependencies can be upgraded:"
    $NCU_CMD --format group

    echo ""
    read -p "Do you want to upgrade these dependencies? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Upgrading dependencies for root..."
        $NCU_CMD -u || { echo -e "${ERROR}Failed to upgrade dependencies for root${RESET}"; exit 1; }
        echo -e "${SUCCESS}✅ Dependencies updated in package.json${RESET}"
    else
        echo "Upgrade cancelled."
        exit 0
    fi
fi

# Regenerate pnpm-lock.yaml to match updated dependencies
echo "Regenerating pnpm-lock.yaml..."
pnpm install --no-frozen-lockfile --store-dir=/app/.pnpm-store || { echo -e "${ERROR}Failed to regenerate pnpm-lock.yaml${RESET}"; exit 1; }
echo -e "${SUCCESS}✅ pnpm-lock.yaml regenerated successfully${RESET}"

# After postinstall hook runs (which syncs deps), we need to regenerate lockfile again
echo "Final lockfile regeneration after dependency sync..."
pnpm install --no-frozen-lockfile --store-dir=/app/.pnpm-store || { echo -e "${ERROR}Failed to regenerate final lockfile${RESET}"; exit 1; }
echo -e "${SUCCESS}✅ Final lockfile regenerated successfully${RESET}"

# Validate workspace packages (now with --no-frozen-lockfile since we just updated)
for pkg in packages/onsocial-js packages/onsocial-app packages/onsocial-auth packages/onsocial-backend; do
  if [ -d "$pkg" ]; then
    echo "Validating $pkg..."
    pnpm --dir $pkg install --no-frozen-lockfile --store-dir=/app/.pnpm-store || { echo -e "${ERROR}Failed to validate $pkg${RESET}"; exit 1; }
    echo -e "${SUCCESS}✅ $pkg validated successfully${RESET}"
  else
    echo -e "${ERROR}Directory $pkg not found${RESET}"
    exit 1
  fi
done

echo -e "${SUCCESS}✅ All dependencies upgraded and validated successfully${RESET}"
