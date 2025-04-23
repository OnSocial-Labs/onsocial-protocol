#!/bin/bash

# Configuration
SANDBOX_HOME="/tmp/near-sandbox"
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

handle_error() {
  echo -e "${RED}Error: $1${NC}"
  exit 1
}

case "$1" in
  init)
    echo "Initializing NEAR Sandbox..."
    near-sandbox --home "$SANDBOX_HOME" init || handle_error "Failed to initialize sandbox"
    echo -e "${GREEN}Sandbox initialized${NC}"
    ;;
  run)
    echo "Running NEAR Sandbox..."
    near-sandbox --home "$SANDBOX_HOME" run || handle_error "Failed to run sandbox"
    ;;
  stop)
    echo "Stopping NEAR Sandbox..."
    pkill -f "near-sandbox" || echo "No sandbox process found"
    echo -e "${GREEN}Sandbox stopped${NC}"
    ;;
  clean)
    echo "Cleaning NEAR Sandbox data..."
    rm -rf "$SANDBOX_HOME" || handle_error "Failed to clean sandbox data"
    echo -e "${GREEN}Sandbox data cleaned${NC}"
    ;;
  *)
    echo "Usage: $0 {init|run|stop|clean}"
    exit 1
    ;;
esac