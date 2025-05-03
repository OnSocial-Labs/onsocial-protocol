#!/bin/bash

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  exit 1
}

update_tools() {
  echo "Updating Rust..."
  rustup update || handle_error "Failed to update Rust"
  echo "Updating cargo-near..."
  cargo install cargo-near --force || handle_error "Failed to update cargo-near"
  echo "Updating near-cli and near-sandbox..."
  npm install -g near-cli near-sandbox || handle_error "Failed to update near-cli or near-sandbox"
  echo -e "${GREEN}Tools updated successfully${NC}"
}

case "$1" in
  *)
    update_tools
    ;;
esac

echo -e "${GREEN}Tool update complete!${NC}"