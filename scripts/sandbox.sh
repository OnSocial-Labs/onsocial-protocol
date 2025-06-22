#!/bin/bash

# NEAR Sandbox Management Script
# Compatible with OnSocial Protocol Makefile requirements

# Configuration from environment or defaults
CODE_DIR="${CODE_DIR:-$(pwd)}"
CONTRACTS_DOCKER_IMAGE="${CONTRACTS_DOCKER_IMAGE:-contracts-builder}"
NEAR_SANDBOX_PORT="${NEAR_SANDBOX_PORT:-3030}"
VERBOSE="${VERBOSE:-0}"

# Local configuration
SANDBOX_HOME="/tmp/near-sandbox"

# Color and emoji variables
SUCCESS="✅ \033[0;32m"
ERROR="❌ \033[0;31m"
WARNING="⚠️  \033[0;33m"
RESET="\033[0m"

handle_error() {
  echo -e "${ERROR}Error: $1${RESET}"
  exit 1
}

log_verbose() {
  [ "$VERBOSE" = "1" ] && echo "$1"
}

check_docker_image() {
  if ! docker images -q "$CONTRACTS_DOCKER_IMAGE" | grep -q .; then
    echo -e "${ERROR}Error: Docker image '$CONTRACTS_DOCKER_IMAGE' not found!${RESET}"
    echo -e "${WARNING}You need to build the contracts Docker image first.${RESET}"
    echo -e "${WARNING}   Run: make build-docker-contracts${RESET}"
    echo -e "${WARNING}   Or:  make rebuild-docker-contracts${RESET}"
    exit 1
  fi
}

case "$1" in
  init)
    echo "Initializing NEAR Sandbox..."
    check_docker_image
    log_verbose "Running: docker run -v $CODE_DIR/near-data:/tmp/near-sandbox --rm -e VERBOSE=$VERBOSE $CONTRACTS_DOCKER_IMAGE near-sandbox --home /tmp/near-sandbox init"
    docker run -v "$CODE_DIR/near-data:/tmp/near-sandbox" --rm -e VERBOSE="$VERBOSE" "$CONTRACTS_DOCKER_IMAGE" near-sandbox --home /tmp/near-sandbox init || handle_error "Failed to initialize sandbox"
    echo -e "${SUCCESS}Sandbox initialized successfully${RESET}"
    ;;
  start)
    echo "Starting NEAR Sandbox..."
    check_docker_image
    
    # Stop existing sandbox if running
    if docker ps | grep near-sandbox > /dev/null; then
      echo -e "${SUCCESS}Sandbox already running${RESET}"
      exit 0
    fi
    
    # Stop any existing containers
    docker stop near-sandbox 2>/dev/null || true
    docker rm near-sandbox 2>/dev/null || true
    
    # Initialize if needed
    if [ ! -d "$CODE_DIR/near-data" ] || [ ! -f "$CODE_DIR/near-data/config.json" ]; then
      echo "Initializing sandbox data..."
      "$0" init
    fi
    
    # Check port availability
    if lsof -i :$NEAR_SANDBOX_PORT | grep LISTEN > /dev/null; then
      echo -e "${ERROR}Error: Port $NEAR_SANDBOX_PORT is in use${RESET}"
      lsof -i :$NEAR_SANDBOX_PORT
      exit 1
    fi
    
    # Start sandbox
    log_verbose "Running: docker run -d --cap-add=SYS_ADMIN -p $NEAR_SANDBOX_PORT:3030 --name near-sandbox -v $CODE_DIR/near-data:/tmp/near-sandbox -e VERBOSE=$VERBOSE $CONTRACTS_DOCKER_IMAGE bash -c 'near-sandbox --home /tmp/near-sandbox run'"
    docker run -d --cap-add=SYS_ADMIN -p "$NEAR_SANDBOX_PORT:3030" --name near-sandbox -v "$CODE_DIR/near-data:/tmp/near-sandbox" -e VERBOSE="$VERBOSE" "$CONTRACTS_DOCKER_IMAGE" bash -c "near-sandbox --home /tmp/near-sandbox run"
    
    # Wait for sandbox to be ready
    for i in $(seq 1 60); do
      if curl -s "http://localhost:$NEAR_SANDBOX_PORT/status" > /dev/null; then
        echo -e "${SUCCESS}Sandbox started successfully on port $NEAR_SANDBOX_PORT${RESET}"
        exit 0
      fi
      echo "Waiting for sandbox... ($i/60)"
      sleep 6
    done
    
    # Check if container failed
    if ! docker ps | grep near-sandbox > /dev/null; then
      echo -e "${ERROR}Error: Sandbox failed to start${RESET}"
      docker logs near-sandbox
      exit 1
    fi
    
    # Check if sandbox is responding
    if ! curl -s "http://localhost:$NEAR_SANDBOX_PORT/status" > /dev/null; then
      echo -e "${ERROR}Error: Sandbox not responding${RESET}"
      docker logs near-sandbox
      exit 1
    fi
    ;;
  stop)
    echo "Stopping NEAR Sandbox..."
    log_verbose "Running: docker stop/rm near-sandbox"
    lsof -i :$NEAR_SANDBOX_PORT | grep LISTEN | awk '{print $2}' | xargs -r kill -9 || true
    docker stop near-sandbox 2>/dev/null || true
    docker rm near-sandbox 2>/dev/null || true
    echo -e "${SUCCESS}Sandbox stopped successfully${RESET}"
    ;;
  clean)
    echo "Cleaning NEAR Sandbox..."
    "$0" stop || true
    log_verbose "Running: rm -rf $CODE_DIR/near-data"
    if ! rm -rf "$CODE_DIR/near-data" 2>/dev/null; then
      echo "Using Docker to clean files with root ownership..."
      docker run --rm -v "$CODE_DIR:/workspace" "$CONTRACTS_DOCKER_IMAGE" rm -rf /workspace/near-data 2>/dev/null || true
    fi
    echo -e "${SUCCESS}Sandbox stopped and data cleaned${RESET}"
    ;;
  logs)
    echo "Displaying NEAR Sandbox logs..."
    docker logs near-sandbox 2>/dev/null || echo -e "${ERROR}Error: Sandbox container not found${RESET}"
    echo -e "${SUCCESS}Logs displayed successfully${RESET}"
    ;;
  *)
    echo "Usage: $0 {init|start|stop|clean|logs}"
    exit 1
    ;;
esac