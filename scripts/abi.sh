#!/bin/bash

BASE_DIR="$(pwd)/contracts"
CONTRACTS=($(grep -oP '"contracts/[^"]+"' Cargo.toml | sed 's/"contracts\///;s/"//'))

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

generate_abi() {
  local contract=$1
  echo "Generating ABI for $contract..."
  cd "$BASE_DIR/$contract" || handle_error "Directory $contract not found"
  [ "$NEAR_ENV" = "sandbox" ] && curl -s http://localhost:3030 >/dev/null || handle_error "NEAR Sandbox not running" "Run sandbox first"
  [ "$VERBOSE" = "1" ] && echo "Running: cargo near abi"
  cargo near abi || handle_error "Failed to generate ABI for $contract"
  echo -e "${SUCCESS}$contract ABI generated successfully${RESET}"
}

ERROR_FLAG=0
for contract in "${CONTRACTS[@]}"; do
  generate_abi "$contract" || ERROR_FLAG=1 &
done
wait
[ $ERROR_FLAG -eq 1 ] && handle_error "ABI generation failed for one or more contracts"
echo -e "${SUCCESS}ABI generation complete!${RESET}"