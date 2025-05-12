#!/bin/bash
set -e

# Default to non-verbose output
VERBOSE=${VERBOSE:-0}

log() {
    if [ "$VERBOSE" -eq 1 ]; then
        echo "$1"
    fi
}

echo "Starting interactive JavaScript dependency upgrade..."

# Define packages (root and packages/*)
PACKAGES=("root")
for pkg in packages/*; do
    if [ -d "$pkg" ] && [ -f "$pkg/package.json" ]; then
        pkg_name=$(basename "$pkg")
        PACKAGES+=("$pkg_name")
    fi
done

# Display packages for selection
echo "Available packages to upgrade:"
for i in "${!PACKAGES[@]}"; do
    echo "$i: ${PACKAGES[$i]}"
done

# Prompt for package selection
echo "Enter the numbers of the packages to upgrade (space-separated, e.g., '0 1 2', or 'all' for all):"
read -r selections

# Handle 'all' case
if [ "$selections" = "all" ]; then
    selections=$(seq 0 $((${#PACKAGES[@]} - 1)) | tr '\n' ' ')
fi

# Validate selections
for sel in $selections; do
    if ! [[ "$sel" =~ ^[0-9]+$ ]] || [ "$sel" -ge "${#PACKAGES[@]}" ]; then
        echo "Error: Invalid selection '$sel'. Valid options are 0 to $((${#PACKAGES[@]} - 1))."
        exit 1
    fi
done

# Function to list and select dependencies
upgrade_package() {
    local pkg=$1
    local pkg_dir=$2

    echo "Checking outdated dependencies for $pkg..."
    if [ -z "$pkg_dir" ]; then
        outdated=$(pnpm outdated --format=json || echo "[]")
    else
        outdated=$(pnpm --dir "$pkg_dir" outdated --format=json || echo "[]")
    fi

    if [ "$outdated" = "[]" ]; then
        echo "No outdated dependencies found for $pkg."
        return
    fi

    # Parse outdated dependencies
    mapfile -t dep_list < <(echo "$outdated" | jq -r '.[] | "\(.name) (\(.current) -> \(.latest))"')
    if [ ${#dep_list[@]} -eq 0 ]; then
        echo "No outdated dependencies found for $pkg."
        return
    fi

    # Display dependencies
    echo "Outdated dependencies for $pkg:"
    for i in "${!dep_list[@]}"; do
        echo "$i: ${dep_list[$i]}"
    done

    # Prompt for dependency selection
    echo "Enter the numbers of the dependencies to upgrade (space-separated, e.g., '0 1', or 'all' for all, or 'none' to skip):"
    read -r dep_selections

    if [ "$dep_selections" = "none" ]; then
        echo "Skipping dependency upgrades for $pkg."
        return
    fi

    if [ "$dep_selections" = "all" ]; then
        if [ -z "$pkg_dir" ]; then
            pnpm update --workspace || { echo "Error: Failed to update dependencies for $pkg."; exit 1; }
        else
            pnpm --dir "$pkg_dir" update || { echo "Error: Failed to update dependencies for $pkg."; exit 1; }
        fi
        log "All dependencies for $pkg updated."
        return
    fi

    # Validate dependency selections
    for dep_sel in $dep_selections; do
        if ! [[ "$dep_sel" =~ ^[0-9]+$ ]] || [ "$dep_sel" -ge "${#dep_list[@]}" ]; then
            echo "Error: Invalid dependency selection '$dep_sel'. Valid options are 0 to $((${#dep_list[@]} - 1))."
            exit 1
        fi
    done

    # Upgrade selected dependencies
    for dep_sel in $dep_selections; do
        dep_name=$(echo "${dep_list[$dep_sel]}" | awk '{print $1}')
        echo "Upgrading $dep_name for $pkg..."
        if [ -z "$pkg_dir" ]; then
            pnpm update "$dep_name" --workspace || { echo "Error: Failed to update $dep_name for $pkg."; exit 1; }
        else
            pnpm --dir "$pkg_dir" update "$dep_name" || { echo "Error: Failed to update $dep_name for $pkg."; exit 1; }
        fi
        log "$dep_name for $pkg updated."
    done
}

# Upgrade selected packages
for sel in $selections; do
    pkg=${PACKAGES[$sel]}
    if [ "$pkg" = "root" ]; then
        upgrade_package "root" ""
    else
        upgrade_package "$pkg" "packages/$pkg"
    fi
done

echo "JavaScript dependency upgrade completed successfully."