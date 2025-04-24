#!/bin/bash

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
    pkill -f "near-sandbox" || true
    near-sandbox --home "$SANDBOX_HOME" run > "$SANDBOX_HOME/sandbox.log" 2>&1 &
    sleep 2
    if ! lsof -i :3030 >/dev/null; then
      cat "$SANDBOX_HOME/sandbox.log"
      handle_error "Failed to start sandbox (port 3030 not bound)"
    fi
    echo -e "${GREEN}Sandbox started${NC}"
    ;;
  stop)
    echo "Stopping NEAR Sandbox..."
    pkill -f "near-sandbox" || echo "No sandbox running"
    echo -e "${GREEN}Sandbox stopped${NC}"
    ;;
  clean)
    echo "Cleaning NEAR Sandbox data..."
    pkill -f "near-sandbox" || echo "No sandbox running"
    rm -rf "$SANDBOX_HOME" || echo "No $SANDBOX_HOME directory found"
    echo -e "${GREEN}Sandbox data cleaned${NC}"
    ;;
  *)
    echo "Usage: $0 {init|run|stop|clean}"
    exit 1
    ;;
esac