#!/bin/bash

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

inspect_state() {
  local contract_id=$1
  local method=$2
  local args=$3
  echo "Inspecting state for $contract_id ($method)..."
  [ -z "$contract_id" ] && handle_error "No CONTRACT_ID specified"
  [ -z "$method" ] && handle_error "No METHOD specified"
  [ "$VERBOSE" = "1" ] && echo "Running: near view $contract_id $method $args --nodeUrl $NEAR_NODE_URL"
  near view "$contract_id" "$method" "$args" --nodeUrl "$NEAR_NODE_URL" || handle_error "Failed to inspect state for $contract_id"
  echo -e "${SUCCESS}State inspected successfully${RESET}"
}

case "$1" in
  *)
    inspect_state "$1" "$2" "$3"
    ;;
esac

echo -e "${SUCCESS}State inspection complete!${RESET}"