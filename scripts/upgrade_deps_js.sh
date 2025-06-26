#!/bin/bash
set -e

# Always use the latest pnpm version via Corepack
echo "Ensuring latest pnpm is installed via Corepack..."
corepack prepare pnpm@latest --activate

# Use a local npm cache, npmrc, and config to avoid global permission issues
export npm_config_cache="$(pwd)/.npm-cache"
export npm_config_userconfig="$(pwd)/.npmrc"
touch "$(pwd)/.npmrc"
export XDG_CONFIG_HOME="$(pwd)/.config"
mkdir -p "$(pwd)/.config"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

echo "Checking JavaScript dependencies..."

# Use a local pnpm-store directory for compatibility
PNPM_STORE_DIR=".pnpm-store"
mkdir -p "$PNPM_STORE_DIR"
chmod -R 775 "$PNPM_STORE_DIR"

# Always use npx npm-check-updates for reliability
NCU_CMD="npx -y npm-check-updates@latest --color"

# Upgrade dependencies in all workspace packages interactively
any_outdated=0
for pkg in packages/*; do
  if [ -f "$pkg/package.json" ]; then
    echo "Checking $pkg/package.json"
    UPGRADE_LIST=$(cd "$pkg" && FORCE_COLOR=1 npx -y npm-check-updates@latest --color)
    if echo "$UPGRADE_LIST" | grep -q "All dependencies match the latest package versions"; then
      echo -e "${SUCCESS} $pkg: All dependencies match the latest package versions${RESET}"
    elif [ -z "$UPGRADE_LIST" ]; then
      echo -e "${SUCCESS} $pkg: No dependencies found to upgrade${RESET}"
    else
      any_outdated=1
      echo "$pkg: The following dependencies can be upgraded:"
      echo "$UPGRADE_LIST"
      echo ""
      read -p "Do you want to upgrade these dependencies in $pkg? (y/N): " -n 1 -r
      echo ""
      if [[ $REPLY =~ ^[Yy]$ ]]; then
        (cd "$pkg" && FORCE_COLOR=1 npx -y npm-check-updates@latest -u --color) || { echo -e "${ERROR}Failed to upgrade dependencies for $pkg${RESET}"; exit 1; }
        echo -e "${SUCCESS} $pkg: Dependencies updated in package.json${RESET}"
      else
        echo -e "${ERROR} $pkg: JavaScript dependencies upgrade cancelled${RESET}"
      fi
    fi
  fi
done

# Show outdated dependencies at root
UPGRADE_LIST=$(FORCE_COLOR=1 $NCU_CMD)
root_outdated=0
if echo "$UPGRADE_LIST" | grep -q "All dependencies match the latest package versions"; then
    echo -e "${SUCCESS} All dependencies match the latest package versions in root${RESET}"
elif [ -z "$UPGRADE_LIST" ]; then
    echo -e "${SUCCESS} No dependencies found to upgrade in root${RESET}"
else
    root_outdated=1
    FILTERED_UPGRADE_LIST=$(echo "$UPGRADE_LIST" | grep -v -E "npm-check-updates|upgrade package.json")
    echo "The following dependencies can be upgraded in root:"
    echo "$FILTERED_UPGRADE_LIST"
    echo ""
    read -p "Do you want to upgrade these dependencies? (y/N): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Upgrading dependencies for root..."
        FORCE_COLOR=1 $NCU_CMD -u || { echo -e "${ERROR}Failed to upgrade dependencies for root${RESET}"; exit 1; }
        echo -e "${SUCCESS} Dependencies updated in package.json (root)${RESET}"
    else
        echo -e "${ERROR} JavaScript dependencies upgrade cancelled in root${RESET}"
    fi
fi

# Regenerate pnpm-lock.yaml to match updated dependencies
echo "Regenerating pnpm-lock.yaml..."
pnpm install --no-frozen-lockfile --store-dir="$PNPM_STORE_DIR" || { echo -e "${ERROR}Failed to regenerate pnpm-lock.yaml${RESET}"; exit 1; }
echo -e "${SUCCESS} pnpm-lock.yaml regenerated successfully${RESET}"

echo "Final lockfile regeneration after dependency sync..."
pnpm install --no-frozen-lockfile --store-dir="$PNPM_STORE_DIR" || { echo -e "${ERROR}Failed to regenerate final lockfile${RESET}"; exit 1; }
echo -e "${SUCCESS} Final lockfile regenerated successfully${RESET}"

# Validate workspace packages (now with --no-frozen-lockfile since we just updated)
for pkg in packages/onsocial-js packages/onsocial-app packages/onsocial-auth packages/onsocial-backend; do
  if [ -d "$pkg" ]; then
    echo "Validating $pkg..."
    pnpm --dir $pkg install --no-frozen-lockfile --store-dir="$PNPM_STORE_DIR" || { echo -e "${ERROR}Failed to validate $pkg${RESET}"; exit 1; }
    echo -e "${SUCCESS} $pkg validated successfully${RESET}"
  else
    echo -e "${ERROR}Directory $pkg not found${RESET}"
    exit 1
  fi
 done

# Improved summary: show status for each package and root
all_up_to_date=1
for pkg in packages/*; do
  if [ -f "$pkg/package.json" ]; then
    REMAINING=$(cd "$pkg" && npx -y npm-check-updates@latest --jsonUpgraded)
    if [ "$REMAINING" != "{}" ]; then
      echo -e "${WARNING} $pkg still has outdated dependencies${RESET}"
      all_up_to_date=0
    else
      echo -e "${SUCCESS} $pkg is up to date${RESET}"
    fi
  fi
done
ROOT_REMAINING=$(npx -y npm-check-updates@latest --jsonUpgraded)
if [ "$ROOT_REMAINING" != "{}" ]; then
  echo -e "${WARNING} Root package.json still has outdated dependencies${RESET}"
  all_up_to_date=0
else
  echo -e "${SUCCESS} Root package.json is up to date${RESET}"
fi

if [ $all_up_to_date -eq 1 ]; then
  echo -e "${SUCCESS} All JavaScript dependencies in all packages are up to date!${RESET}"
fi
