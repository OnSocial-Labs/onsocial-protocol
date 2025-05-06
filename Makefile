# Makefile for OnSocial Contracts Monorepo
# Simplifies common tasks for building, testing, deploying, and managing NEAR smart contracts

# Load environment variables based on NETWORK
ifeq ($(NETWORK),mainnet)
	include .env.mainnet
else ifeq ($(NETWORK),testnet)
	include .env.testnet
else
	include .env
endif
export

# Default variables
NETWORK ?= sandbox
AUTH_ACCOUNT ?= test.near
FT_ACCOUNT ?= test.near
RELAYER_ACCOUNT ?= test.near
DOCKER_IMAGE := onsocial-builder
CODE_DIR := $(shell pwd)
NEAR_SANDBOX_PORT := 3030
NEAR_NODE_URL ?= http://localhost:3030
VERBOSE ?= 0
DRY_RUN ?= 0
VALID_CONTRACTS := auth-onsocial ft-wrapper-onsocial relayer-onsocial

# Default target
.PHONY: all
all: build test

# Ensure all scripts are executable
.PHONY: ensure-scripts-executable
ensure-scripts-executable:
	@echo "Ensuring scripts are executable..."
	@chmod +x scripts/*.sh
	@/bin/echo -e "\033[0;32mScripts permissions set successfully\033[0m"

# Validate CONTRACT variable
.PHONY: validate-contract
validate-contract:
	@if [ -z "$(CONTRACT)" ]; then \
	/bin/echo -e "\033[0;31mError: CONTRACT variable not set. Use CONTRACT=<contract-name> (e.g., auth-onsocial)\033[0m"; \
	exit 1; \
	fi
	@if ! echo "$(VALID_CONTRACTS)" | grep -qw "$(CONTRACT)"; then \
	/bin/echo -e "\033[0;31mError: Invalid CONTRACT '$(CONTRACT)'. Valid options: $(VALID_CONTRACTS)\033[0m"; \
	exit 1; \
	fi

# Build Docker image
.PHONY: build-docker
build-docker:
	@echo "Checking for existing Docker image $(DOCKER_IMAGE)..."
	@if ! docker images -q $(DOCKER_IMAGE) | grep -q .; then \
	/bin/echo "Building Docker image $(DOCKER_IMAGE)..."; \
	docker build -t $(DOCKER_IMAGE) -f docker/Dockerfile.builder .; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image $(DOCKER_IMAGE) already exists\033[0m"; \
	fi

# Force rebuild Docker image
.PHONY: rebuild-docker
rebuild-docker:
	@echo "Forcing rebuild of Docker image $(DOCKER_IMAGE)..."
	@docker ps -a --filter "ancestor=$(DOCKER_IMAGE)" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=$(DOCKER_IMAGE)" -q | xargs -r docker rm || true
	@docker rmi $(DOCKER_IMAGE) || true
	@docker build -t $(DOCKER_IMAGE) -f docker/Dockerfile.builder .
	@/bin/echo -e "\033[0;32mDocker image rebuilt successfully\033[0m"

# Clean and update Cargo dependencies
.PHONY: cargo-update
cargo-update: build-docker ensure-scripts-executable
	@echo "Updating Cargo dependencies..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh cargo-update"
	@/bin/echo -e "\033[0;32mCargo dependencies updated successfully\033[0m"

# Upgrade workspace dependencies with interactive selection
.PHONY: upgrade-deps
upgrade-deps: build-docker ensure-scripts-executable
	@echo "Running interactive dependency upgrade..."
	@docker run -v $(CODE_DIR):/code --rm -it -e VERBOSE=$(VERBOSE) -e INCOMPATIBLE=$(INCOMPATIBLE) $(DOCKER_IMAGE) bash -c "./scripts/upgrade_deps.sh"

# Format Rust code
.PHONY: fmt
fmt: build-docker ensure-scripts-executable
	@echo "Formatting Rust code..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh fmt"
	@/bin/echo -e "\033[0;32mCode formatted successfully\033[0m"

# Lint Rust code
.PHONY: lint
lint: build-docker ensure-scripts-executable
	@echo "Linting Rust code..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh lint"
	@/bin/echo -e "\033[0;32mCode linted successfully\033[0m"

# Check workspace syntax
.PHONY: check
check: build-docker ensure-scripts-executable
	@echo "Checking workspace syntax..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh check"
	@/bin/echo -e "\033[0;32mWorkspace checked successfully\033[0m"

# Audit dependencies for vulnerabilities
.PHONY: audit
audit: build-docker ensure-scripts-executable
	@echo "Auditing dependencies..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh audit"
	@/bin/echo -e "\033[0;32mDependencies audited successfully\033[0m"

# Generate test coverage report
.PHONY: test-coverage
test-coverage: build-docker ensure-scripts-executable
	@echo "Generating test coverage report for $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --network host --privileged --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test_coverage.sh $(CONTRACT)"
	@/bin/echo -e "\033[0;32mTest coverage report generated successfully\033[0m"

# Run all tests (unit and integration)
.PHONY: test-all
test-all: test test-integration
	@/bin/echo -e "\033[0;32mAll tests completed successfully\033[0m"

# Inspect contract state
.PHONY: inspect-state
inspect-state: build-docker ensure-scripts-executable
	@if [ -z "$(CONTRACT_ID)" ] || [ -z "$(METHOD)" ]; then \
	/bin/echo -e "\033[0;31mError: CONTRACT_ID and METHOD variables must be set (e.g., CONTRACT_ID=auth.sandbox METHOD=get_keys)\033[0m"; \
	exit 1; \
	fi
	@echo "Inspecting state for $(CONTRACT_ID)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/inspect_state.sh $(CONTRACT_ID) $(METHOD) '$(ARGS)'"
	@/bin/echo -e "\033[0;32mState inspected successfully\033[0m"

# Display NEAR Sandbox logs
.PHONY: logs-sandbox
logs-sandbox:
	@echo "Displaying NEAR Sandbox logs..."
	@docker logs near-sandbox || /bin/echo -e "\033[0;31mError: Sandbox container not found\033[0m"
	@/bin/echo -e "\033[0;32mSandbox logs displayed\033[0m"

# Verify a specific contract
.PHONY: verify-contract
verify-contract: build-docker ensure-scripts-executable validate-contract
	@echo "Verifying contract $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh verify $(CONTRACT)"
	@/bin/echo -e "\033[0;31mContract $(CONTRACT) verified successfully\033[0m"

# Clean all artifacts and sandbox data
.PHONY: clean-all
clean-all: build-docker ensure-scripts-executable
	@echo "Cleaning all artifacts and sandbox data..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh clean-all"
	@$(MAKE) stop-sandbox
	@/bin/echo -e "\033[0;32mAll artifacts and sandbox data cleaned successfully\033[0m"

# Check dependency tree
.PHONY: check-deps
check-deps: build-docker ensure-scripts-executable
	@echo "Checking dependency tree..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh check-deps"
	@/bin/echo -e "\033[0;32mDependency tree checked successfully\033[0m"

# Build all contracts
.PHONY: build
build: build-docker ensure-scripts-executable
	@echo "Building contracts..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh"
	@/bin/echo -e "\033[0;32mContracts built successfully\033[0m"

# Build a specific contract
.PHONY: build-contract
build-contract: build-docker ensure-scripts-executable validate-contract
	@echo "Building contract $(CONTRACT)..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh build-contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract $(CONTRACT) built successfully\033[0m"

# Build reproducible WASM for mainnet
.PHONY: build-reproducible
build-reproducible: build-docker ensure-scripts-executable
	@echo "Building reproducible WASM..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh reproducible"
	@/bin/echo -e "\033[0;32mReproducible WASM built successfully\033[0m"

# Generate ABIs
.PHONY: abi
abi: build-docker ensure-scripts-executable
	@echo "Generating ABIs..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/abi.sh"
	@/bin/echo -e "\033[0;32mABIs generated successfully\033[0m"

# Run unit tests for all contracts
.PHONY: test
test: build-docker ensure-scripts-executable
	@echo "Running unit tests..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh unit" || { /bin/echo -e "\033[0;31mUnit tests failed\033[0m"; exit 1; }
	@/bin/echo -e "\033[0;32mUnit tests completed successfully\033[0m"

# Run unit tests for a specific contract
.PHONY: test-unit
test-unit: build-docker ensure-scripts-executable validate-contract
	@echo "Running unit tests for $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh unit $(CONTRACT)"
	@/bin/echo -e "\033[0;32mUnit tests completed successfully\033[0m"

# Run integration tests for a specific contract or all
.PHONY: test-integration
test-integration: build-docker ensure-scripts-executable start-sandbox
	@echo "Running integration tests for $(CONTRACT)..."
	@if [ -n "$(CONTRACT)" ] && [ "$(CONTRACT)" != "cross-contract" ]; then $(MAKE) validate-contract; fi
	@docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh integration $(CONTRACT) && exit 0 || { echo -e '\033[0;31mIntegration tests failed\033[0m'; exit 1; }" ; \
	TEST_STATUS=$$?; \
	/bin/echo "Stopping sandbox..."; \
	$(MAKE) stop-sandbox; \
	if [ $$TEST_STATUS -ne 0 ]; then \
	/bin/echo -e "\033[0;31mIntegration tests failed\033[0m"; \
	exit $$TEST_STATUS; \
	else \
	/bin/echo -e "\033[0;32mIntegration tests completed successfully\033[0m"; \
	fi

# Deploy a contract
.PHONY: deploy
deploy: build-docker ensure-scripts-executable validate-contract
	@echo "Deploying contract $(CONTRACT) to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract deployed successfully\033[0m"

# Initialize a deployed contract
.PHONY: deploy-init
deploy-init: build-docker ensure-scripts-executable validate-contract
	@echo "Initializing contract $(CONTRACT) on $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh init --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract initialized successfully\033[0m"

# Deploy with reproducible WASM
.PHONY: deploy-reproducible
deploy-reproducible: build-docker ensure-scripts-executable validate-contract
	@echo "Deploying contract $(CONTRACT) with reproducible WASM to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh reproducible --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract deployed with reproducible WASM successfully\033[0m"

# Dry-run deployment
.PHONY: deploy-dry-run
deploy-dry-run: build-docker ensure-scripts-executable validate-contract
	@echo "Simulating deployment of $(CONTRACT) to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=1 $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mDry-run deployment simulation completed successfully\033[0m"

# Initialize NEAR Sandbox
.PHONY: init-sandbox
init-sandbox:
	@echo "Initializing NEAR Sandbox..."
	@docker run -v $(CODE_DIR)/near-data:/tmp/near-sandbox --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) near-sandbox --home /tmp/near-sandbox init
	@/bin/echo -e "\033[0;32mSandbox initialized successfully\033[0m"

# Start NEAR Sandbox
.PHONY: start-sandbox
start-sandbox:
	@echo "Starting NEAR Sandbox..."
	@$(MAKE) stop-sandbox
	@docker run -d --cap-add=SYS_ADMIN -p $(NEAR_SANDBOX_PORT):3030 --name near-sandbox -v $(CODE_DIR)/near-data:/tmp/near-sandbox -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "near-sandbox --home /tmp/near-sandbox init && near-sandbox --home /tmp/near-sandbox run"
	@sleep 5
	@if ! docker ps | grep near-sandbox > /dev/null; then /bin/echo -e "\033[0;31mError: Sandbox failed to start\033[0m"; docker logs near-sandbox; exit 1; fi
	@curl -s http://localhost:3030/status > /dev/null && /bin/echo -e "\033[0;32mSandbox started successfully\033[0m" || (/bin/echo -e "\033[0;31mError: Sandbox not responding\033[0m"; docker logs near-sandbox; exit 1)

# Stop NEAR Sandbox
.PHONY: stop-sandbox
stop-sandbox:
	@echo "Stopping NEAR Sandbox..."
	@lsof -i :3030 | grep LISTEN | awk '{print $$2}' | xargs -r kill -9 || true
	@docker stop near-sandbox || true
	@docker rm near-sandbox || true
	@/bin/echo -e "\033[0;32mSandbox stopped\033[0m"

# Clean up sandbox
.PHONY: clean-sandbox
clean-sandbox:
	@echo "Cleaning NEAR Sandbox..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/sandbox.sh clean"
	@$(MAKE) stop-sandbox
	@/bin/echo -e "\033[0;32mSandbox stopped and data cleaned\033[0m"

# Patch sandbox state
.PHONY: patch-state
patch-state: start-sandbox
	@echo "Patching sandbox state..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e MASTER_ACCOUNT=$(AUTH_ACCOUNT) -e CONTRACT_ID=$(CONTRACT_ID) -e KEY=$(KEY) -e VALUE=$(VALUE) -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/patch_state.sh"
	@/bin/echo -e "\033[0;32mSandbox state patched successfully\033[0m"

# Help
.PHONY: help
help:
	@echo "OnSocial Contracts Monorepo Makefile"
	@echo ""
	@echo "Usage: make [target] [VARIABLE=value]"
	@echo ""
	@echo "Targets:"
	@echo "  all                  Build and test contracts (default)"
	@echo "  build-docker         Build Docker image"
	@echo "  rebuild-docker       Force rebuild Docker image"
	@echo "  cargo-update         Clean and update Cargo dependencies"
	@echo "  upgrade-deps         Interactively select dependencies to upgrade by number (INCOMPATIBLE=1 for incompatible upgrades)"
	@echo "  fmt                  Format Rust code"
	@echo "  lint                 Lint Rust code"
	@echo "  check                Check workspace syntax"
	@echo "  audit                Audit dependencies for vulnerabilities"
	@echo "  test-coverage        Generate test coverage report (CONTRACT=contract-name)"
	@echo "  test-all             Run all unit and integration tests"
	@echo "  inspect-state        Inspect contract state (CONTRACT_ID=id, METHOD=method, ARGS=args)"
	@echo "  logs-sandbox         Display NEAR Sandbox logs"
	@echo "  verify-contract      Verify a specific contract (CONTRACT=contract-name)"
	@echo "  clean-all            Clean all artifacts and sandbox data"
	@echo "  check-deps           Check dependency tree"
	@echo "  build                Build all contracts"
	@echo "  build-contract       Build a specific contract (CONTRACT=contract-name)"
	@echo "  build-reproducible   Build reproducible WASM for mainnet"
	@echo "  abi                  Generate ABIs"
	@echo "  test                 Run unit tests for all contracts"
	@echo "  test-unit            Run unit tests for a specific contract (CONTRACT=contract-name)"
	@echo "  test-integration     Run integration tests for a specific contract or all (CONTRACT=contract-name)"
	@echo "  deploy               Deploy a contract (CONTRACT=contract-name, NETWORK=network)"
	@echo "  deploy-init          Initialize a deployed contract"
	@echo "  deploy-reproducible  Deploy with reproducible WASM"
	@echo "  deploy-dry-run       Simulate deployment without executing (CONTRACT=contract-name, NETWORK=network)"
	@echo "  init-sandbox         Initialize NEAR Sandbox"
	@echo "  start-sandbox        Start NEAR Sandbox"
	@echo "  stop-sandbox         Stop NEAR Sandbox"
	@echo "  clean-sandbox        Clean NEAR Sandbox data"
	@echo "  patch-state          Patch sandbox state (CONTRACT_ID=id, KEY=key, VALUE=value)"
	@echo ""
	@echo "Variables:"
	@echo "  NETWORK              Network to deploy to (sandbox, testnet, mainnet; default: sandbox)"
	@echo "  AUTH_ACCOUNT         Account for auth-onsocial (default: test.near)"
	@echo "  FT_ACCOUNT           Account for ft-wrapper-onsocial (default: test.near)"
	@echo "  RELAYER_ACCOUNT      Account for relayer-onsocial (default: test.near)"
	@echo "  CONTRACT             Contract name (e.g., auth-onsocial)"
	@echo "  CONTRACT_ID          Contract ID for state inspection (e.g., auth.sandbox)"
	@echo "  METHOD               View method for state inspection (e.g., get_keys)"
	@echo "  ARGS                 JSON args for view method (e.g., {\"account_id\": \"test.near\"})"
	@echo "  NEAR_NODE_URL        NEAR node URL (default: http://localhost:3030)"
	@echo "  LINT                 Set to 1 to enable linting during build (e.g., LINT=1)"
	@echo "  VERBOSE              Set to 1 to enable detailed output (e.g., VERBOSE=1)"
	@echo "  DRY_RUN              Set to 1 to simulate deployment (e.g., DRY_RUN=1)"
	@echo "  INCOMPATIBLE         Set to 1 to include incompatible dependency upgrades (e.g., INCOMPATIBLE=1)"
	@echo ""
	@echo "Examples:"
	@echo "  make build"
	@echo "  make build LINT=1 VERBOSE=1"
	@echo "  make build-contract CONTRACT=auth-onsocial"
	@echo "  make build-contract CONTRACT=auth-onsocial LINT=1 VERBOSE=1"
	@echo "  make fmt"
	@echo "  make lint"
	@echo "  make check"
	@echo "  make audit"
	@echo "  make test-coverage CONTRACT=auth-onsocial"
	@echo "  make test-all"
	@echo "  make inspect-state CONTRACT_ID=auth.sandbox METHOD=get_keys ARGS='{\"account_id\": \"test.near\"}'"
	@echo "  make logs-sandbox"
	@echo "  make verify-contract CONTRACT=auth-onsocial"
	@echo "  make clean-all"
	@echo "  make check-deps"
	@echo "  make test-unit CONTRACT=auth-onsocial"
	@echo "  make test-integration CONTRACT=ft-wrapper-onsocial"
	@echo "  make deploy CONTRACT=auth-onsocial NETWORK=sandbox"
	@echo "  make deploy CONTRACT=auth-onsocial NETWORK=testnet"
	@echo "  make deploy-dry-run CONTRACT=auth-onsocial NETWORK=mainnet"
	@echo "  make start-sandbox"
	@echo "  make upgrade-deps"
	@echo "  make upgrade-deps INCOMPATIBLE=1"