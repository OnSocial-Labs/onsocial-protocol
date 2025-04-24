#!/bin/bash

BASE_DIR="$(pwd)/contracts"
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  exit 1
}

generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running" "Run sandbox first"
  cargo near abi || handle_error "Failed to generate ABI for $contract"
  echo -e "${GREEN}$contract ABI generated successfully${NC}"
}

for contract in "${CONTRACTS[@]}"; do
  generate_abi "$contract" &
done
wait
echo -e "${GREEN}ABI generation complete!${NC}"