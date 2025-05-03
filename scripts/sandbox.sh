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
    [ "$VERBOSE" = "1" ] && echo "Running: near-sandbox --home $SANDBOX_HOME init"
    near-sandbox --home "$SANDBOX_HOME" init || handle_error "Failed to initialize sandbox"
    echo -e "${GREEN}Sandbox initialized${NC}"
    ;;
  run)
    echo "Running NEAR Sandbox..."
    [ "$VERBOSE" = "1" ] && echo "Running: docker stop/rm near-sandbox && docker run ..."
    docker stop near-sandbox 2>/dev/null || true
    docker rm near-sandbox 2>/dev/null || true
    docker run -d -p 3030:3030 --name near-sandbox -v "$(pwd)/near-data:/tmp/near-sandbox" onsocial-builder bash -c "near-sandbox --home /tmp/near-sandbox init && near-sandbox --home /tmp/near-sandbox run" > "$SANDBOX_HOME/sandbox.log" 2>&1
    sleep 5
    if ! docker ps | grep near-sandbox >/dev/null; then
      cat "$SANDBOX_HOME/sandbox.log"
      handle_error "Failed to start sandbox (port 3030 not bound)"
    fi
    echo -e "${GREEN}Sandbox started${NC}"
    ;;
  stop)
    echo "Stopping NEAR Sandbox..."
    [ "$VERBOSE" = "1" ] && echo "Running: docker stop/rm near-sandbox"
    docker stop near-sandbox 2>/dev/null || echo "No sandbox running"
    docker rm near-sandbox 2>/dev/null || echo "No sandbox container"
    echo -e "${GREEN}Sandbox stopped${NC}"
    ;;
  clean)
    echo "Cleaning NEAR Sandbox data..."
    [ "$VERBOSE" = "1" ] && echo "Running: docker stop/rm near-sandbox && rm -rf near-data"
    docker stop near-sandbox 2>/dev/null || echo "No sandbox running"
    docker rm near-sandbox 2>/dev/null || echo "No sandbox container"
    rm -rf "$(pwd)/near-data" || echo "No near-data directory found"
    echo -e "${GREEN}Sandbox data cleaned${NC}"
    ;;
  *)
    echo "Usage: $0 {init|run|stop|clean}"
    exit 1
    ;;
esac