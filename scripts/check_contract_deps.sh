#!/bin/bash

# Check contract dependency versions against crates.io
# Usage: ./scripts/check_contract_deps.sh <contract-name>
# Example: ./scripts/check_contract_deps.sh core-onsocial

set -e

# Colors
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
BLUE="\033[0;34m"
RESET="\033[0m"

CONTRACT_NAME="$1"

if [ -z "$CONTRACT_NAME" ]; then
    echo "❌ Usage: $0 <contract-name>"
    echo "   Example: $0 core-onsocial"
    exit 1
fi

CARGO_TOML="contracts/$CONTRACT_NAME/Cargo.toml"

if [ ! -f "$CARGO_TOML" ]; then
    echo "❌ Contract not found: $CARGO_TOML"
    exit 1
fi

echo ""
echo -e "${BLUE}📦 $CONTRACT_NAME dependency versions:${RESET}"
echo ""
printf "  %-20s %-12s %-12s %s\n" "Dependency" "Current" "Latest" "Status"
echo "  ────────────────────────────────────────────────────────────"

# Extract dependencies from Cargo.toml (handles both formats)
# near-sdk = "5.24.0"
# serde = { version = "1.0", features = ["derive"] }
extract_deps() {
    local section="$1"
    local in_section=0
    
    while IFS= read -r line; do
        # Check for section headers
        if [[ "$line" =~ ^\[.*\]$ ]]; then
            if [[ "$line" == "[$section]" ]]; then
                in_section=1
            else
                in_section=0
            fi
            continue
        fi
        
        # Skip if not in target section
        [ $in_section -eq 0 ] && continue
        
        # Skip empty lines and comments
        [[ -z "$line" || "$line" =~ ^# ]] && continue
        
        # Extract dependency name and version
        if [[ "$line" =~ ^([a-zA-Z0-9_-]+)\ *=\ *\"([0-9.]+)\" ]]; then
            echo "${BASH_REMATCH[1]}:${BASH_REMATCH[2]}"
        elif [[ "$line" =~ ^([a-zA-Z0-9_-]+)\ *=\ *\{.*version\ *=\ *\"([0-9.]+)\" ]]; then
            echo "${BASH_REMATCH[1]}:${BASH_REMATCH[2]}"
        fi
    done < "$CARGO_TOML"
}

# Get latest version from crates.io
get_latest_version() {
    local crate_name="$1"
    # Use cargo search (more reliable than curl to crates.io API)
    local result=$(cargo search "$crate_name" --limit 1 2>/dev/null | head -1)
    # Match version with optional prerelease suffix (e.g., 3.0.0-pre.4)
    if [[ "$result" =~ ^$crate_name\ =\ \"([0-9.]+(-[a-zA-Z0-9.]+)?)\" ]]; then
        echo "${BASH_REMATCH[1]}"
    else
        echo "?"
    fi
}

# Check all dependencies
check_deps() {
    local deps=$(extract_deps "dependencies")
    local dev_deps=$(extract_deps "dev-dependencies")
    
    # Combine and deduplicate
    local all_deps=$(echo -e "$deps\n$dev_deps" | sort -u | grep -v '^$')
    
    while IFS=: read -r name current; do
        [ -z "$name" ] && continue
        
        # Get latest version (with caching to avoid repeated lookups)
        local latest=$(get_latest_version "$name")
        
        # Determine status
        if [ "$latest" = "?" ]; then
            status="❓ unknown"
        elif [ "$current" = "$latest" ]; then
            status="${GREEN}✅ up to date${RESET}"
        else
            # Simple version comparison (works for most cases)
            status="${YELLOW}⬆️  upgrade available${RESET}"
        fi
        
        printf "  %-20s %-12s %-12s %b\n" "$name" "$current" "$latest" "$status"
    done <<< "$all_deps"
}

check_deps

echo ""
echo -e "  ${BLUE}Edit $CARGO_TOML to upgrade.${RESET}"
echo ""
