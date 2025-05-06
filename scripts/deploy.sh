#!/bin/bash

BASE_DIR="$(pwd)/contracts"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  [ -n "$2" ] && echo -e "${RED}Details:\n$2${NC}"
  exit 1
}

# Validate .env file based on NETWORK
case "$NETWORK" in
  mainnet)
    [ -f .env.mainnet ] || handle_error ".env.mainnet not found"
    ;;
  testnet)
    [ -f .env.testnet ] || handle_error ".env.testnet not found"
    ;;
  sandbox)
    [ -f .env ] || handle_error ".env not found"
    ;;
  *)
    handle_error "Invalid NETWORK: $NETWORK. Must be sandbox, testnet, or mainnet"
    ;;
esac

# Detect contracts from Cargo.toml
if [ -f Cargo.toml ]; then
  CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
fi

[ ${#CONTRACTS[@]} -eq 0 ] && {
  echo -e "${RED}Error: No contracts found${NC}"
  exit 1
}

deploy_contract() {
  local contract=$1
  local build_type=$2
  local init=$3
  [ -z "$contract" ] && handle_error "No contract specified"
  [ -z "$NETWORK" ] && handle_error "NETWORK not set"
  [ -z "$AUTH_ACCOUNT" ] && handle_error "AUTH_ACCOUNT not set"

  # Confirmation for testnet or mainnet
  if [ "$NETWORK" = "mainnet" ] || [ "$NETWORK" = "testnet" ]; then
    if [ "$DRY_RUN" != "1" ]; then
      echo "WARNING: Deploying to $NETWORK. Confirm (y/N):"
      read -r confirm
      [ "$confirm" != "y" ] && handle_error "$NETWORK deployment aborted"
    fi
  fi

  # Dry-run mode
  if [ "$DRY_RUN" = "1" ]; then
    echo "Dry-run: Would deploy $contract to $NETWORK with build_type=$build_type, init=$init"
    echo "Dry-run: AUTH_ACCOUNT=$AUTH_ACCOUNT, FT_ACCOUNT=$FT_ACCOUNT, RELAYER_ACCOUNT=$RELAYER_ACCOUNT, NEAR_NODE_URL=$NEAR_NODE_URL"
    return 0
  fi

  # Determine WASM path
  local wasm_path="target/wasm32-unknown-unknown/release/${contract//-/_}.wasm"
  [ ! -f "$wasm_path" ] && handle_error "WASM file not found: $wasm_path"

  # Set NEAR_ENV
  export NEAR_ENV="$NETWORK"
  [ "$VERBOSE" = "1" ] && echo "Set NEAR_ENV=$NEAR_ENV"

  # Deploy
  echo "Deploying $contract to $NETWORK..."
  [ "$VERBOSE" = "1" ] && echo "Running: near deploy ..."
  near deploy --wasmFile "$wasm_path" --accountId "${AUTH_ACCOUNT}" --nodeUrl "$NEAR_NODE_URL" || handle_error "Failed to deploy $contract"
  echo -e "${GREEN}$contract deployed successfully${NC}"

  # Initialize if requested
  if [ "$init" = "init" ]; then
    echo "Initializing $contract..."
    # Load init args from configs/contracts.json
    local init_args
    init_args=$(jq -r ".[] | select(.name == \"$contract\") | .init" configs/contracts.json)
    [ -z "$init_args" ] && handle_error "No init args found for $contract in configs/contracts.json"
    [ "$VERBOSE" = "1" ] && echo "Running: near call ${AUTH_ACCOUNT} new '$init_args' ..."
    near call "${AUTH_ACCOUNT}" new "$init_args" --accountId "${AUTH_ACCOUNT}" --nodeUrl "$NEAR_NODE_URL" || handle_error "Failed to initialize $contract"
    echo -e "${GREEN}$contract initialized successfully${NC}"
  fi
}

case "$1" in
  --contract)
    shift
    local contract="$2"
    local init=""
    local build_type="non-reproducible-wasm"
    [ "$3" = "init" ] && init="init"
    [ "$1" = "reproducible" ] && build_type="reproducible-wasm"
    deploy_contract "$contract" "$build_type" "$init"
    ;;
  reproducible)
    deploy_contract "$3" "reproducible-wasm" ""
    ;;
  init)
    deploy_contract "$3" "non-reproducible-wasm" "init"
    ;;
  *)
    handle_error "Invalid usage. Use: ./deploy.sh [--contract <contract> [init] | reproducible --contract <contract>]"
    ;;
esac

echo -e "${GREEN}Deployment complete!${NC}"