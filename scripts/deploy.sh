#!/bin/bash

# Configuration
NETWORK="${NETWORK:-sandbox}" # Options: sandbox, testnet, mainnet; defaults to sandbox

# Define contract-to-account mappings
# Format: "contract_name:contract_id:account_id"
# Override via environment variables or edit directly
CONTRACTS=(
  "auth-onsocial:auth.$NETWORK:${AUTH_ACCOUNT:-test.near}"
  "ft-wrapper-onsocial:ft-wrapper.$NETWORK:${FT_ACCOUNT:-test.near}"
  "relayer-onsocial:relayer.$NETWORK:${RELAYER_ACCOUNT:-test.near}"
)

# NEAR CLI configuration
if [ "$NETWORK" = "sandbox" ]; then
  NEAR_CLI="near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"
else
  NEAR_CLI="near"
  # Ensure accounts are set for testnet/mainnet
  for contract in "${CONTRACTS[@]}"; do
    IFS=':' read -r _ _ account <<< "$contract"
    if [ "$account" = "test.near" ]; then
      echo -e "${RED}Error: Account for $contract must be set for $NETWORK (not test.near)${NC}"
      exit 1
    fi
  done
fi

BASE_DIR="$(pwd)/contracts"

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

# Deploy a single contract
deploy_contract() {
  local contract_name=$1
  local contract_id=$2
  local account_id=$3
  local build_type=$4
  echo "Deploying $contract_name to $contract_id using $account_id..."
  cd "$BASE_DIR/$contract_name" || handle_error "Directory $contract_name not found" "Check if $contract_name exists in $BASE_DIR"
  cargo near deploy "$build_type" --account-id "$account_id" --contract-name "$contract_id" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to deploy $contract_name with $account_id" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract_name deployed successfully${NC}"
}

# Initialize contracts
init_contracts() {
  echo "Initializing contracts..."
  # Use the respective account for each contract's initialization
  $NEAR_CLI call auth.$NETWORK new '{}' --accountId "${AUTH_ACCOUNT:-test.near}" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to initialize auth-onsocial" "$(cat /tmp/error.log)"
  $NEAR_CLI call ft-wrapper.$NETWORK new '{"manager": "'${AUTH_ACCOUNT:-test.near}'", "relayer_contract": "relayer.'$NETWORK'", "storage_deposit": "1250000000000000000000"}' --accountId "${FT_ACCOUNT:-test.near}" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to initialize ft-wrapper-onsocial" "$(cat /tmp/error.log)"
  $NEAR_CLI call relayer.$NETWORK new '{"offload_recipient": "'${AUTH_ACCOUNT:-test.near}'", "auth_contract": "auth.'$NETWORK'", "ft_wrapper_contract": "ft-wrapper.'$NETWORK'"}' --accountId "${RELAYER_ACCOUNT:-test.near}" 2> >(tee /tmp/error.log >&2) || handle_error "Failed to initialize relayer-onsocial" "$(cat /tmp/error.log)"
  echo -e "${GREEN}Initialization complete${NC}"
}

# Main script
case "$1" in
  init)
    init_contracts
    ;;
  reproducible)
    for contract in "${CONTRACTS[@]}"; do
      IFS=':' read -r name id account <<< "$contract"
      deploy_contract "$name" "$id" "$account" "build-reproducible-wasm" &
    done
    wait
    echo -e "${GREEN}Reproducible deployment complete!${NC}"
    ;;
  *)
    for contract in "${CONTRACTS[@]}"; do
      IFS=':' read -r name id account <<< "$contract"
      deploy_contract "$name" "$id" "$account" "build-non-reproducible-wasm" &
    done
    wait
    echo -e "${GREEN}Non-reproducible deployment complete!${NC}"
    ;;
esac