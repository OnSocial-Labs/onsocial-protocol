#!/bin/bash

[ -f .env ] && source .env

NETWORK="${NETWORK:-sandbox}"
CONFIG_FILE="$(pwd)/configs/contracts.json"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

# Parse --contract flag
CONTRACT_FILTER=""
while [[ "$#" -gt 0 ]]; do
  case $1 in
    --contract) CONTRACT_FILTER="$2"; shift ;;
    *) break ;;
  esac
  shift
done

# Check for jq
command -v jq >/dev/null 2>&1 || { echo -e "${RED}Error: jq is required${NC}"; exit 1; }

# Validate config file
[ ! -f "$CONFIG_FILE" ] && { echo -e "${RED}Error: $CONFIG_FILE not found${NC}"; exit 1; }

# Set jq filter
if [ -n "$CONTRACT_FILTER" ]; then
  jq_filter="[.[] | select(.name == \"$CONTRACT_FILTER\")]"
  grep -q "contracts/$CONTRACT_FILTER" Cargo.toml || { echo -e "${RED}Error: Contract $CONTRACT_FILTER not found in Cargo.toml${NC}"; exit 1; }
else
  jq_filter='.[]'
fi

# NEAR CLI configuration
if [ "$NETWORK" = "sandbox" ]; then
  NEAR_CLI="near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"
else
  NEAR_CLI="near"
fi

BASE_DIR="$(pwd)/contracts"

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  [ -n "$2" ] && echo -e "${RED}Details:\n$2${NC}"
  exit 1
}

deploy_contract() {
  local contract_name=$1
  local contract_id=$2
  local account_id=$3
  local build_type=$4
  echo "Deploying $contract_name to $contract_id using $account_id ($build_type)..."
  cd "$BASE_DIR/$contract_name" || handle_error "Directory $contract_name not found"
  cargo near deploy "$build_type" --account-id "$account_id" --contract-name "$contract_id" 2> /tmp/error.log || handle_error "Failed to deploy $contract_name" "$(cat /tmp/error.log)"
  echo -e "${GREEN}$contract_name deployed successfully${NC}"
}

init_contracts() {
  echo "Initializing contracts..."
  while IFS= read -r contract; do
    contract_name=$(echo "$contract" | jq -r '.name')
    contract_id=$(echo "$contract" | jq -r '.id' | sed "s/\\\$NETWORK/$NETWORK/")
    account_id=$(echo "$contract" | jq -r '.account' | sed "s/\\\$NETWORK/$NETWORK/")
    init_cmd=$(echo "$contract" | jq -r '.init' | sed "s/\\\$NETWORK/$NETWORK/")
    if [ "$NETWORK" != "sandbox" ] && [ "$account_id" = "test.near" ]; then
      handle_error "Invalid account $account_id for $NETWORK" "Set proper account for $contract_name"
    fi
    echo "Initializing $contract_name ($contract_id) with $account_id..."
    $NEAR_CLI call "$contract_id" "$init_cmd" --accountId "$account_id" 2> /tmp/error.log || handle_error "Failed to initialize $contract_name" "$(cat /tmp/error.log)"
    echo -e "${GREEN}$contract_name initialized successfully${NC}"
  done < <(jq -c "$jq_filter" "$CONFIG_FILE")
  echo -e "${GREEN}Initialization complete${NC}"
}

case "$1" in
  init)
    init_contracts
    ;;
  reproducible)
    while IFS= read -r contract; do
      contract_name=$(echo "$contract" | jq -r '.name')
      contract_id=$(echo "$contract" | jq -r '.id' | sed "s/\\\$NETWORK/$NETWORK/")
      account_id=$(echo "$contract" | jq -r '.account' | sed "s/\\\$NETWORK/$NETWORK/")
      deploy_contract "$contract_name" "$contract_id" "$account_id" "build-reproducible-wasm" &
    done < <(jq -c "$jq_filter" "$CONFIG_FILE")
    wait
    echo -e "${GREEN}Reproducible deployment complete!${NC}"
    ;;
  *)
    while IFS= read -r contract; do
      contract_name=$(echo "$contract" | jq -r '.name')
      contract_id=$(echo "$contract" | jq -r '.id' | sed "s/\\\$NETWORK/$NETWORK/")
      account_id=$(echo "$contract" | jq -r '.account' | sed "s/\\\$NETWORK/$NETWORK/")
      deploy_contract "$contract_name" "$contract_id" "$account_id" "build-non-reproducible-wasm" &
    done < <(jq -c "$jq_filter" "$CONFIG_FILE")
    wait
    echo -e "${GREEN}Non-reproducible deployment complete!${NC}"
    ;;
esac