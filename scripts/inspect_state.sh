#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
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
  echo -e "${GREEN}State inspected successfully${NC}"
}

case "$1" in
  *)
    inspect_state "$1" "$2" "$3"
    ;;
esac

echo -e "${GREEN}State inspection complete!${NC}"