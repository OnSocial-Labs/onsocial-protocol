#!/bin/bash

# Configuration
NETWORK="sandbox"
MASTER_ACCOUNT="test.near"
NEAR_CLI="near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"
CONTRACT_ID="auth.$NETWORK"
KEY="state"
VALUE="new_state"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Function to handle errors with detailed output
handle_error() {
  local error_msg=$1
  local error_output=$2
  echo -e "${RED}Error: $error_msg${NC}"
  echo -e "${RED}Details:\n$error_output${NC}"
  exit 1
}

# Patch contract state
patch_state() {
  echo "Patching state for $CONTRACT_ID..."
  $NEAR_CLI call $CONTRACT_ID sandbox_patch_state "{\"records\": [{\"contract_id\": \"$CONTRACT_ID\", \"key\": \"$KEY\", \"value\": \"$VALUE\"}]}" --accountId "$MASTER_ACCOUNT" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to patch state for $CONTRACT_ID" "$(cat /tmp/error.log)"
  echo -e "${GREEN}State patched successfully${NC}"
}

# Main script
if [ "$NETWORK" != "sandbox" ]; then
  handle_error "This script is only for NEAR Sandbox" "Set NETWORK=sandbox"
fi

patch_state