#!/bin/bash

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

# Debug function
debug() {
    if [ "$VERBOSE" -eq 1 ]; then
        echo "DEBUG: $1" >&2
    fi
}

# Ensure VERBOSE is set
VERBOSE=${VERBOSE:-0}
debug "VERBOSE set to $VERBOSE"

# Run cargo upgrade --dry-run and capture output
echo "Previewing dependency upgrades..."
DRY_RUN_OUTPUT=$(cargo upgrade --dry-run ${INCOMPATIBLE:+--incompatible} 2>&1)
CARGO_EXIT=$?
if [ $CARGO_EXIT -ne 0 ]; then
    echo -e "${ERROR}Error running cargo upgrade --dry-run (exit code $CARGO_EXIT)${RESET}"
    echo "$DRY_RUN_OUTPUT"
    exit 1
fi
# Normalize line endings for WSL2 compatibility
DRY_RUN_OUTPUT=$(echo "$DRY_RUN_OUTPUT" | tr -d '\r')
echo "$DRY_RUN_OUTPUT"
debug "Dry-run output captured"

# Parse upgradable dependencies (format: name old_req compatible latest new_req [note])
DEPENDENCIES=()
INDEX=1
debug "Starting dependency parsing"
while IFS= read -r line; do
    # Skip empty or invalid lines
    if [ -z "$line" ]; then
        debug "Skipping empty line"
        continue
    fi
    debug "Processing line: $line"
    if [[ $line =~ ^([a-zA-Z0-9_-]+)\ +([0-9.]+)\ +([0-9.]+)\ +([0-9.]+)\ +([0-9.]+)(\ +incompatible)? ]]; then
        DEP_NAME="${BASH_REMATCH[1]}"
        OLD_VERSION="${BASH_REMATCH[2]}"
        NEW_VERSION="${BASH_REMATCH[5]}"
        NOTE="${BASH_REMATCH[6]:-}"
        DEPENDENCIES+=("$INDEX:$DEP_NAME:$OLD_VERSION -> $NEW_VERSION$NOTE")
        debug "Parsed dependency: $DEP_NAME ($OLD_VERSION -> $NEW_VERSION$NOTE)"
        ((INDEX++))
    else
        debug "Line does not match regex: $line"
    fi
done <<< "$(echo "$DRY_RUN_OUTPUT" | grep -E '^[a-zA-Z0-9_-]+\ +[0-9.]' || { echo -e "${ERROR}Error: grep failed to find dependency lines${RESET}"; exit 1; })"
debug "Finished parsing, found ${#DEPENDENCIES[@]} dependencies"

# Check if any dependencies are available
if [ ${#DEPENDENCIES[@]} -eq 0 ]; then
    echo -e "${WARNING}No upgradable dependencies found${RESET}"
    exit 0
fi

# Display numbered list of dependencies
echo ""
echo "Available dependencies to upgrade:"
for dep in "${DEPENDENCIES[@]}"; do
    echo "${dep%%:*}. ${dep#*:}"
done
debug "Displayed dependency list"

# Prompt for selection
echo ""
debug "Prompting for input"
read -r -p "Enter numbers of dependencies to upgrade (comma-separated, e.g., 1,3; leave blank to abort): " selection
debug "Raw selection input: '$selection'"

# Handle empty input
if [ -z "$selection" ]; then
    echo -e "${WARNING}Upgrade aborted${RESET}"
    exit 0
fi

# Normalize input: replace semicolons with commas, remove extra spaces
selection=$(echo "$selection" | tr ';' ',' | tr -s ' ' | sed 's/ *, */,/g' | sed 's/^,*//;s/,*$//')
debug "Normalized selection: $selection"

# Parse selected numbers
SELECTED_DEPS=()
IFS=',' read -r -a numbers <<< "$selection"
debug "Parsed numbers: ${numbers[*]}"
for num in "${numbers[@]}"; do
    num=$(echo "$num" | tr -d '[:space:]') # Trim whitespace
    debug "Processing number: $num"
    if [[ ! $num =~ ^[0-9]+$ ]] || [ $num -lt 1 ] || [ $num -gt ${#DEPENDENCIES[@]} ]; then
        echo -e "${ERROR}Invalid selection: $num${RESET}"
        exit 1
    fi
    # Extract dependency name (format: INDEX:NAME:VERSION)
    dep="${DEPENDENCIES[$((num-1))]}"
    dep_name=$(echo "$dep" | cut -d':' -f2)
    SELECTED_DEPS+=("$dep_name")
    debug "Selected dependency: $dep_name"
done

# Confirm upgrade
echo ""
echo "Selected dependencies: ${SELECTED_DEPS[*]}"
debug "Prompting for confirmation"
read -r -p "Upgrade selected dependencies? (y/N): " confirm
debug "Confirmation input: '$confirm'"
if [ "$confirm" != "y" ]; then
    echo -e "${WARNING}Upgrade aborted${RESET}"
    exit 0
fi

# Upgrade selected dependencies
echo "Upgrading selected dependencies: ${SELECTED_DEPS[*]}..."
for dep in "${SELECTED_DEPS[@]}"; do
    echo "Upgrading $dep..."
    cargo upgrade --package "$dep" ${INCOMPATIBLE:+--incompatible} || { echo -e "${ERROR}Failed to upgrade $dep${RESET}"; exit 1; }
    debug "Upgraded $dep"
done

# Update Cargo.lock
echo "Updating Cargo.lock..."
cargo update || { echo -e "${ERROR}Failed to update Cargo.lock${RESET}"; exit 1; }
debug "Cargo.lock updated"

echo -e "${SUCCESS}Selected dependencies upgraded successfully${RESET}"