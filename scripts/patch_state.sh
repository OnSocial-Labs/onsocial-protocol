#!/bin/bash

NETWORK="${NETWORK:-sandbox}"
MASTER_ACCOUNT="${MASTER_ACCOUNT:-test.near}"
CONTRACT_ID="${CONTRACT_ID:-auth.$NETWORK}"
KEY="${KEY:-state}"
VALUE="${VALUE:-new_state}"
NEAR_CLI="near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  local error_msg=$1
  local error_output=$2
  echo -e "${ERROR}Error: $error_msg${RESET}"
  echo -e "${ERROR}Details:\n$error_output${RESET}"
  exit 1
}

patch_state() {
  echo "Patching state for $CONTRACT_ID..."
  [ "$VERBOSE" = "1" ] && echo "Running: $NEAR_CLI call $CONTRACT_ID sandbox_patch_state ..."
  $NEAR_CLI call $CONTRACT_ID sandbox_patch_state "{\"records\": [{\"contract_id\": \"$CONTRACT_ID\", \"key\": \"$KEY\", \"value\": \"$VALUE\"}]}" --accountId "$MASTER_ACCOUNT" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to patch state for $CONTRACT_ID" "$(cat /tmp/error.log)"
  echo -e "${SUCCESS}State patched successfully${RESET}"
}

if [ "$NETWORK" != "sandbox" ]; then
  handle_error "This script is only for NEAR Sandbox" "Set NETWORK=sandbox"
fi

patch_state