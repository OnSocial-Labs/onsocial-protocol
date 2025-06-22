#!/bin/bash

BASE_DIR="$(pwd)/contracts"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
INFO="ℹ️  \033[0;34m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  [ -n "$2" ] && echo -e "${ERROR}Details:\n$2${RESET}"
  exit 1
}

log_info() {
  echo -e "${INFO}$1${RESET}"
}

# Parse Makefile-style environment variables for unified interface
parse_makefile_params() {
  # Support Makefile parameter style (INIT=1, REPRODUCIBLE=1, DRY_RUN=1)
  if [ "$INIT" = "1" ]; then
    DEPLOY_MODE="init"
    log_info "Makefile mode: Deploy with initialization (INIT=1)"
  elif [ "$REPRODUCIBLE" = "1" ]; then
    DEPLOY_MODE="reproducible"
    log_info "Makefile mode: Reproducible WASM deployment (REPRODUCIBLE=1)"
  elif [ "$DRY_RUN" = "1" ]; then
    DEPLOY_MODE="dry-run"
    log_info "Makefile mode: Dry-run simulation (DRY_RUN=1)"
  else
    DEPLOY_MODE="standard"
    log_info "Makefile mode: Standard deployment"
  fi
}

# Setup secure credentials if using key file
setup_secure_credentials() {
  if [ -n "$PRIVATE_KEY_FILE" ]; then
    log_info "Setting up secure credentials from key file: $PRIVATE_KEY_FILE"
    
    # Validate key file exists
    [ ! -f "$PRIVATE_KEY_FILE" ] && handle_error "Private key file not found: $PRIVATE_KEY_FILE"
    
    # Validate key file format
    if ! jq -e '.account_id and .public_key and .private_key' "$PRIVATE_KEY_FILE" >/dev/null 2>&1; then
      handle_error "Invalid key file format. Must contain account_id, public_key, and private_key fields"
    fi
    
    # Get account from key file
    local key_account
    key_account=$(jq -r '.account_id' "$PRIVATE_KEY_FILE")
    log_info "Using key file for account: $key_account"
    
    # Create temporary credentials directory
    TEMP_CREDS_DIR=$(mktemp -d)
    # Set trap to cleanup on exit
    trap "rm -rf $TEMP_CREDS_DIR" EXIT
    
    mkdir -p "$TEMP_CREDS_DIR/$NETWORK"
    cp "$PRIVATE_KEY_FILE" "$TEMP_CREDS_DIR/$NETWORK/$key_account.json"
    
    # Override NEAR credentials directory
    export NEAR_CREDENTIALS_DIR="$TEMP_CREDS_DIR"
    
    # Update AUTH_ACCOUNT to use the key file account if not explicitly set
    if [ -z "$DEPLOY_ACCOUNT_OVERRIDE" ]; then
      export AUTH_ACCOUNT="$key_account"
      log_info "Using deployer account from key file: $AUTH_ACCOUNT"
    fi
    
    log_info "Temporary credentials directory: $TEMP_CREDS_DIR"
  else
    log_info "Using NEAR CLI default credentials from ~/.near-credentials"
  fi
}

# Parse Makefile parameters first (if no command line args)
if [ $# -eq 0 ] && [ -n "$CONTRACT_NAME" ]; then
  parse_makefile_params
  set -- --contract "$CONTRACT_NAME"
  if [ "$DEPLOY_MODE" = "init" ]; then
    set -- "$@" init
  elif [ "$DEPLOY_MODE" = "reproducible" ]; then
    set -- reproducible --contract "$CONTRACT_NAME"
  fi
fi

# Check if this is a help command first
if [ "$1" = "--help" ] || [ "$1" = "help" ]; then
    cat << 'EOF'
OnSocial Contract Deployment Script

Usage: ./deploy.sh [COMMAND] [OPTIONS]

COMMANDS:
    --contract <name> [init]        Deploy specific contract, optionally initialize
    reproducible --contract <name>  Deploy with reproducible WASM
    init --contract <name>          Deploy and initialize contract
    help                           Show this help message

OPTIONS:
    --use-key-file                 Use private key file (set PRIVATE_KEY_FILE env var)

ENVIRONMENT VARIABLES:
    NETWORK                        Target network (sandbox/testnet/mainnet)
    AUTH_ACCOUNT                   Account ID for deployment
    FT_ACCOUNT                     Account ID for FT wrapper
    RELAYER_ACCOUNT               Account ID for relayer
    NEAR_NODE_URL                 NEAR node URL
    PRIVATE_KEY_FILE              Path to private key file (JSON format)
    VERBOSE                       Enable verbose output (0/1)
    DRY_RUN                       Enable dry-run mode (0/1)

EXAMPLES:
    # Deploy using NEAR CLI credentials
    ./deploy.sh --contract social-onsocial

    # Deploy and initialize
    ./deploy.sh --contract ft-wrapper-onsocial init

    # Deploy using private key file
    PRIVATE_KEY_FILE=./configs/keys/deployer.testnet.json ./deploy.sh --contract social-onsocial

    # Dry run deployment
    DRY_RUN=1 ./deploy.sh --contract social-onsocial

KEY FILE FORMAT:
    {
        "account_id": "your-account.testnet",
        "public_key": "ed25519:...",
        "private_key": "ed25519:..."
    }

EOF
    exit 0
fi

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
  echo -e "${ERROR}Error: No contracts found${RESET}"
  exit 1
}

deploy_contract() {
  local contract=$1
  local build_type=$2
  local init=$3
  [ -z "$contract" ] && handle_error "No contract specified"
  [ -z "$NETWORK" ] && handle_error "NETWORK not set"
  [ -z "$AUTH_ACCOUNT" ] && handle_error "AUTH_ACCOUNT not set"

  # Setup secure credentials if using key file
  setup_secure_credentials

  # Get contract configuration from configs/contracts.json
  local contract_config
  contract_config=$(jq -r ".[] | select(.name == \"$contract\")" configs/contracts.json)
  
  if [ -z "$contract_config" ] || [ "$contract_config" = "null" ]; then
    handle_error "Contract '$contract' not found in configs/contracts.json"
  fi
  
  # Get contract ID and expand environment variables
  local contract_id
  contract_id=$(echo "$contract_config" | jq -r '.id')
  contract_id=$(eval echo "$contract_id")
  
  log_info "Contract ID: $contract_id"
  log_info "Deployer account: $AUTH_ACCOUNT"

  # Confirmation for testnet or mainnet
  if [ "$NETWORK" = "mainnet" ] || [ "$NETWORK" = "testnet" ]; then
    if [ "$DRY_RUN" != "1" ]; then
      echo -e "${WARNING}WARNING: Deploying to $NETWORK${RESET}"
      echo "Contract: $contract"
      echo "Contract ID: $contract_id" 
      echo "Deployer: $AUTH_ACCOUNT"
      echo "Confirm deployment (y/N):"
      read -r confirm
      [ "$confirm" != "y" ] && handle_error "$NETWORK deployment aborted"
    fi
  fi

  # Dry-run mode
  if [ "$DRY_RUN" = "1" ]; then
    echo "DRY RUN: Would deploy $contract to $NETWORK"
    echo "  Contract ID: $contract_id"
    echo "  Deployer: $AUTH_ACCOUNT"
    echo "  Build type: $build_type"
    echo "  Network: $NETWORK"
    echo "  Node URL: $NEAR_NODE_URL"
    if [ "$init" = "init" ]; then
      local init_args
      init_args=$(echo "$contract_config" | jq -r '.init')
      init_args=$(eval echo "$init_args")
      echo "  Init args: $init_args"
    fi
    return 0
  fi

  # Determine WASM path
  local wasm_path="target/wasm32-unknown-unknown/release/${contract//-/_}.wasm"
  [ ! -f "$wasm_path" ] && handle_error "WASM file not found: $wasm_path. Build the contract first."

  # Set NEAR_ENV
  export NEAR_ENV="$NETWORK"
  [ "$VERBOSE" = "1" ] && echo "Set NEAR_ENV=$NEAR_ENV"

  # Deploy
  echo "Deploying $contract to $contract_id on $NETWORK..."
  [ "$VERBOSE" = "1" ] && echo "Running: near deploy --wasmFile $wasm_path --accountId $contract_id ..."
  
  if [ "$VERBOSE" = "1" ]; then
    near deploy --wasmFile "$wasm_path" --accountId "$contract_id" ${NEAR_NODE_URL:+--nodeUrl "$NEAR_NODE_URL"}
  else
    near deploy --wasmFile "$wasm_path" --accountId "$contract_id" ${NEAR_NODE_URL:+--nodeUrl "$NEAR_NODE_URL"} >/dev/null
  fi
  
  echo -e "${SUCCESS}$contract deployed successfully to $contract_id${RESET}"

  # Initialize if requested
  if [ "$init" = "init" ]; then
    echo "Initializing $contract..."
    
    # Load init args from configs/contracts.json
    local init_args
    init_args=$(echo "$contract_config" | jq -r '.init')
    [ -z "$init_args" ] || [ "$init_args" = "null" ] && handle_error "No init args found for $contract in configs/contracts.json"
    
    # Expand environment variables in init args
    init_args=$(eval echo "$init_args")
    
    [ "$VERBOSE" = "1" ] && echo "Running: near call $contract_id new '$init_args' --accountId $AUTH_ACCOUNT ..."
    
    if [ "$VERBOSE" = "1" ]; then
      near call "$contract_id" new "$init_args" --accountId "$AUTH_ACCOUNT" ${NEAR_NODE_URL:+--nodeUrl "$NEAR_NODE_URL"}
    else
      near call "$contract_id" new "$init_args" --accountId "$AUTH_ACCOUNT" ${NEAR_NODE_URL:+--nodeUrl "$NEAR_NODE_URL"} >/dev/null
    fi
    
    echo -e "${SUCCESS}$contract initialized successfully${RESET}"
  fi
}

# Main script execution
parse_makefile_params

case "$DEPLOY_MODE" in
  init)
    shift
    [ "$1" = "--contract" ] && shift
    contract="$1"
    build_type="non-reproducible-wasm"
    [ "$2" = "--use-key-file" ] && shift  # Support --use-key-file flag from Makefile
    deploy_contract "$contract" "$build_type" "init"
    ;;
  reproducible)
    shift
    [ "$1" = "--contract" ] && shift
    contract="$1"
    deploy_contract "$contract" "reproducible-wasm" ""
    ;;
  dry-run)
    shift
    [ "$1" = "--contract" ] && shift
    contract="$1"
    build_type="non-reproducible-wasm"
    [ "$2" = "--use-key-file" ] && shift  # Support --use-key-file flag from Makefile
    deploy_contract "$contract" "$build_type" "init"
    ;;
  standard)
    shift
    [ "$1" = "--contract" ] && shift
    contract="$1"
    init=""
    build_type="non-reproducible-wasm"
    [ "$2" = "init" ] && init="init"
    [ "$2" = "--use-key-file" ] && shift  # Support --use-key-file flag from Makefile
    deploy_contract "$contract" "$build_type" "$init"
    ;;
  *)
    handle_error "Invalid deployment mode: $DEPLOY_MODE"
    ;;
esac

echo -e "${SUCCESS}Deployment complete!${RESET}"