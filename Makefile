# Makefile for OnSocial Contracts Monorepo
# Simplifies common tasks for building, testing, deploying, and managing NEAR smart contracts and JavaScript packages

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
JS_DOCKER_IMAGE := onsocial-js-builder
CODE_DIR := $(shell pwd)
NEAR_SANDBOX_PORT := 3030
NEAR_NODE_URL ?= http://localhost:3030
VERBOSE ?= 0
DRY_RUN ?= 0
VALID_CONTRACTS := auth-onsocial ft-wrapper-onsocial relayer-onsocial social-onsocial marketplace-onsocial staking-onsocial
JS_PACKAGES := onsocial-js app relayer

# Default target
.PHONY: all
all: build-rs test-rs

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

# Clean and reinstall JavaScript dependencies
.PHONY: clean-install-js
clean-install-js: clean-docker-js rebuild-docker-js ensure-scripts-executable
	@echo "Cleaning and reinstalling JavaScript dependencies..."
	@rm -rf node_modules
	@docker volume create pnpm-store
	@docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm install --frozen-lockfile --store-dir=/app/.pnpm-store
	@/bin/echo -e "\033[0;32mJavaScript dependencies reinstalled successfully\033[0m"

# Clean all JavaScript Docker images and volumes
.PHONY: clean-docker-js
clean-docker-js:
	@echo "Cleaning JavaScript Docker images and volumes..."
	@docker ps -a --filter "ancestor=$(JS_DOCKER_IMAGE)" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=$(JS_DOCKER_IMAGE)" -q | xargs -r docker rm || true
	@docker ps -a --filter "ancestor=app-builder" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=app-builder" -q | xargs -r docker rm || true
	@docker ps -a --filter "ancestor=relayer-builder" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=relayer-builder" -q | xargs -r docker rm || true
	@docker rmi $(JS_DOCKER_IMAGE) app-builder relayer-builder || true
	@docker volume rm pnpm-store || true
	@docker system prune -f || true
	@docker volume prune -f || true
	@/bin/echo -e "\033[0;32mJavaScript Docker images and volumes cleaned successfully\033[0m"

# Build Docker image for Rust contracts
.PHONY: build-docker-rs
build-docker-rs:
	@echo "Checking for existing Docker image $(DOCKER_IMAGE)..."
	@if ! docker images -q $(DOCKER_IMAGE) | grep -q .; then \
	/bin/echo "Building Docker image $(DOCKER_IMAGE)..."; \
	docker build -t $(DOCKER_IMAGE) -f docker/Dockerfile.builder .; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image $(DOCKER_IMAGE) already exists\033[0m"; \
	fi

# Force rebuild Docker image for Rust contracts
.PHONY: rebuild-docker-rs
rebuild-docker-rs:
	@echo "Forcing rebuild of Docker image $(DOCKER_IMAGE)..."
	@docker ps -a --filter "ancestor=$(DOCKER_IMAGE)" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=$(DOCKER_IMAGE)" -q | xargs -r docker rm || true
	@docker rmi $(DOCKER_IMAGE) || true
	@docker build -t $(DOCKER_IMAGE) -f docker/Dockerfile.builder . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}
	@/bin/echo -e "\033[0;32mDocker image rebuilt successfully\033[0m"

# Build Docker image for JavaScript (onsocial-js and dependency updates)
.PHONY: build-docker-js
build-docker-js: ensure-scripts-executable
	@echo "Checking for existing Docker image $(JS_DOCKER_IMAGE)..."
	@if ! docker images -q $(JS_DOCKER_IMAGE) | grep -q .; then \
	/bin/echo "Building Docker image $(JS_DOCKER_IMAGE)..."; \
	docker build -t $(JS_DOCKER_IMAGE) -f docker/Dockerfile.onsocial-js .; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image $(JS_DOCKER_IMAGE) already exists\033[0m"; \
	fi

# Force rebuild Docker image for JavaScript (onsocial-js)
.PHONY: rebuild-docker-js
rebuild-docker-js: ensure-scripts-executable
	@echo "Forcing rebuild of Docker image $(JS_DOCKER_IMAGE)..."
	@docker ps -a --filter "ancestor=$(JS_DOCKER_IMAGE)" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=$(JS_DOCKER_IMAGE)" -q | xargs -r docker rm || true
	@docker rmi $(JS_DOCKER_IMAGE) || true
	@docker build -t $(JS_DOCKER_IMAGE) -f docker/Dockerfile.onsocial-js . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}
	@/bin/echo -e "\033[0;32mDocker image rebuilt successfully\033[0m"

# Build Docker image for JavaScript app
.PHONY: build-docker-app
build-docker-app: ensure-scripts-executable
	@echo "Checking for existing Docker image app-builder..."
	@if ! docker images -q app-builder | grep -q .; then \
	/bin/echo "Building Docker image app-builder..."; \
	docker build -t app-builder -f docker/Dockerfile.app . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image app-builder already exists\033[0m"; \
	fi

# Force rebuild Docker image for JavaScript app
.PHONY: rebuild-docker-app
rebuild-docker-app: ensure-scripts-executable
	@echo "Forcing rebuild of Docker image app-builder..."
	@docker ps -a --filter "ancestor=app-builder" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=app-builder" -q | xargs -r docker rm || true
	@docker rmi app-builder || true
	@docker build -t app-builder -f docker/Dockerfile.app . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}
	@/bin/echo -e "\033[0;32mDocker image rebuilt successfully\033[0m"

# Build Docker image for JavaScript relayer
.PHONY: build-docker-relayer
build-docker-relayer: ensure-scripts-executable
	@echo "Checking for existing Docker image relayer-builder..."
	@if ! docker images -q relayer-builder | grep -q .; then \
	/bin/echo "Building Docker image relayer-builder..."; \
	docker build -t relayer-builder -f docker/Dockerfile.relayer . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image relayer-builder already exists\033[0m"; \
	fi

# Force rebuild Docker image for JavaScript relayer
.PHONY: rebuild-docker-relayer
rebuild-docker-relayer: ensure-scripts-executable
	@echo "Forcing rebuild of Docker image relayer-builder..."
	@docker ps -a --filter "ancestor=relayer-builder" -q | xargs -r docker stop || true
	@docker ps -a --filter "ancestor=relayer-builder" -q | xargs -r docker rm || true
	@docker rmi relayer-builder || true
	@docker build -t relayer-builder -f docker/Dockerfile.relayer . || { \
	/bin/echo -e "\033[0;31mDocker build failed, check logs above for details\033[0m"; \
	exit 1; \
	}
	@/bin/echo -e "\033[0;32mDocker image rebuilt successfully\033[0m"

# Clean and update Cargo dependencies
.PHONY: cargo-update-rs
cargo-update-rs: build-docker-rs ensure-scripts-executable
	@echo "Updating Cargo dependencies..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh cargo-update"
	@/bin/echo -e "\033[0;32mCargo dependencies updated successfully\033[0m"

# Upgrade Rust dependencies with interactive selection
.PHONY: upgrade-deps-rs
upgrade-deps-rs: build-docker-rs ensure-scripts-executable
	@echo "Running interactive Rust dependency upgrade..."
	@docker run -v $(CODE_DIR):/code -it --rm -e VERBOSE=$(VERBOSE) -e INCOMPATIBLE=$(INCOMPATIBLE) $(DOCKER_IMAGE) bash -c "./scripts/upgrade_deps.sh"

# Upgrade JavaScript dependencies
.PHONY: upgrade-deps-js
upgrade-deps-js:
	@echo "Running JavaScript dependency upgrade..."
	@docker run -v $(CURDIR):/app -v pnpm-store:/app/.pnpm-store --rm node:slim /bin/bash -c "npm install -g npm@latest pnpm@10.11.0 npm-check-updates@latest && chown -R $(shell id -u):$(shell id -g) /app/.pnpm-store && su node -c 'cd /app && ./scripts/upgrade_deps_js.sh'"
	@echo "JavaScript dependencies upgraded successfully"

# Format Rust code (all contracts)
.PHONY: format-rs
format-rs: build-docker-rs ensure-scripts-executable
	@echo "Formatting Rust code..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh format"
	@/bin/echo -e "\033[0;32mCode formatted successfully\033[0m"

# Format all Rust contracts (alias for format-rs)
.PHONY: format-all-rs
format-all-rs: build-docker-rs ensure-scripts-executable
	@echo "Formatting all Rust contracts..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh format-all"
	@/bin/echo -e "\033[0;32mAll Rust contracts formatted successfully\033[0m"

# Format specific Rust contract
.PHONY: format-rs-contract
format-rs-contract: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Formatting Rust contract $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh format-contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mRust contract $(CONTRACT) formatted successfully\033[0m"

# Lint Rust code (all contracts)
.PHONY: lint-rs
lint-rs: build-docker-rs ensure-scripts-executable
	@echo "Linting Rust code..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh lint"
	@/bin/echo -e "\033[0;32mCode linted successfully\033[0m"

# Lint all Rust contracts (alias for lint-rs)
.PHONY: lint-all-rs
lint-all-rs: build-docker-rs ensure-scripts-executable
	@echo "Linting all Rust contracts..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh lint-all"
	@/bin/echo -e "\033[0;32mAll Rust contracts linted successfully\033[0m"

# Lint specific Rust contract
.PHONY: lint-rs-contract
lint-rs-contract: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Linting Rust contract $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh lint-contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mRust contract $(CONTRACT) linted successfully\033[0m"

# Check Rust workspace syntax
.PHONY: check-rs
check-rs: build-docker-rs ensure-scripts-executable
	@echo "Checking Rust workspace syntax..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh check"
	@/bin/echo -e "\033[0;32mWorkspace checked successfully\033[0m"

# Audit Rust dependencies for vulnerabilities
.PHONY: audit-rs
audit-rs: build-docker-rs ensure-scripts-executable
	@echo "Auditing Rust dependencies..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh audit"
	@/bin/echo -e "\033[0;32mDependencies audited successfully\033[0m"

# Check Rust dependency tree
.PHONY: check-deps-rs
check-deps-rs: build-docker-rs ensure-scripts-executable
	@echo "Checking Rust dependency tree..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh check-deps"
	@/bin/echo -e "\033[0;32mDependency tree checked successfully\033[0m"

# Build all Rust contracts
.PHONY: build-rs
build-rs: build-docker-rs ensure-scripts-executable
	@echo "Building all Rust contracts..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint-rs; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh"
	@/bin/echo -e "\033[0;32mAll Rust contracts built successfully\033[0m"

# Build a specific Rust contract (CONTRACT= required)
.PHONY: build-rs-contract
build-rs-contract: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Building Rust contract $(CONTRACT)..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint-rs; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh build-contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mRust contract $(CONTRACT) built successfully\033[0m"

# Generate test coverage report for a specific contract (CONTRACT= required)
.PHONY: test-coverage-rs
test-coverage-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Generating test coverage report for $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --network host --privileged --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test_coverage.sh $(CONTRACT)"
	@/bin/echo -e "\033[0;32mTest coverage report generated successfully\033[0m"

# Run tests (unit, integration, or all)
.PHONY: test-rs
test-rs:
	@if [ "$(filter unit,$(MAKECMDGOALS))" = "unit" ]; then \
	$(MAKE) test-unit-rs; \
	elif [ "$(filter integration,$(MAKECMDGOALS))" = "integration" ]; then \
	$(MAKE) test-integration-rs; \
	else \
	$(MAKE) test-all-rs; \
	fi

# Dummy targets to allow `make test-rs unit` and `make test-rs integration`
.PHONY: unit integration
unit integration:
	@true

# Run all unit and integration tests for all contracts
.PHONY: test-all-contracts
test-all-contracts: build-docker-rs ensure-scripts-executable start-sandbox
	@echo "Running all unit and integration tests for all contracts..."
	@for contract in $(VALID_CONTRACTS); do \
	$(MAKE) test-all-rs CONTRACT=$$contract || exit 1; \
	done
	@$(MAKE) stop-sandbox
	@/bin/echo -e "\033[0;32mAll tests for all contracts completed successfully\033[0m"

# Run all unit and integration tests (CONTRACT= optional)
.PHONY: test-all-rs
test-all-rs: build-docker-rs ensure-scripts-executable start-sandbox
	@echo "Running all unit and integration tests${CONTRACT:+ for $(CONTRACT)}..."
	@if [ -n "$(CONTRACT)" ] && [ "$(CONTRACT)" != "cross-contract" ]; then $(MAKE) validate-contract; fi
	@docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh all $(CONTRACT) > /code/test-all.log 2>&1 && exit 0 || { cat /code/test-all.log; echo -e '\033[0;31mTests failed\033[0m'; exit 1; }" ; \
	TEST_STATUS=$$?; \
	if [ $$TEST_STATUS -ne 0 ]; then \
	/bin/echo -e "\033[0;31mTests failed, see test-all.log for details\033[0m"; \
	$(MAKE) stop-sandbox; \
	exit $$TEST_STATUS; \
	else \
	/bin/echo -e "\033[0;32mAll tests completed successfully\033[0m"; \
	/bin/echo "Stopping sandbox..."; \
	$(MAKE) stop-sandbox; \
	fi

# Run unit tests for all or specific contract (CONTRACT= optional)
.PHONY: test-unit-rs
test-unit-rs: build-docker-rs ensure-scripts-executable
	@echo "Running unit tests${CONTRACT:+ for $(CONTRACT)}..."
	@if [ -n "$(CONTRACT)" ]; then $(MAKE) validate-contract; fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh unit $(CONTRACT)"
	@/bin/echo -e "\033[0;32mUnit tests completed successfully\033[0m"

# Run integration tests for all or specific contract (CONTRACT= optional)
.PHONY: test-integration-rs
test-integration-rs: build-docker-rs ensure-scripts-executable start-sandbox
	@echo "Running integration tests${CONTRACT:+ for $(CONTRACT)}..."
	@if [ -n "$(CONTRACT)" ] && [ "$(CONTRACT)" != "cross-contract" ]; then $(MAKE) validate-contract; fi
	@docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh integration $(CONTRACT)" ; \
	TEST_STATUS=$$?; \
	$(MAKE) stop-sandbox; \
	exit $$TEST_STATUS

# Deploy a contract (CONTRACT= required)
.PHONY: deploy-rs
deploy-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Deploying contract $(CONTRACT) to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract deployed successfully\033[0m"

# Initialize a deployed contract (CONTRACT= required)
.PHONY: deploy-init-rs
deploy-init-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Initializing contract $(CONTRACT) on $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh init --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract initialized successfully\033[0m"

# Deploy with reproducible WASM (CONTRACT= required)
.PHONY: deploy-reproducible-rs
deploy-reproducible-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Deploying contract $(CONTRACT) with reproducible WASM to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh reproducible --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract deployed with reproducible WASM successfully\033[0m"

# Dry-run deployment (CONTRACT= required)
.PHONY: deploy-dry-run-rs
deploy-dry-run-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Simulating deployment of $(CONTRACT) to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=1 $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $(CONTRACT)"
	@/bin/echo -e "\033[0;32mDry-run deployment simulation completed successfully\033[0m"

# Verify a specific contract (CONTRACT= required)
.PHONY: verify-contract-rs
verify-contract-rs: build-docker-rs ensure-scripts-executable validate-contract
	@echo "Verifying contract $(CONTRACT)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh verify $(CONTRACT)"
	@/bin/echo -e "\033[0;32mContract $(CONTRACT) verified successfully\033[0m"

# Build reproducible WASM for mainnet
.PHONY: build-reproducible-rs
build-reproducible-rs: build-docker-rs ensure-scripts-executable
	@echo "Building reproducible WASM..."
	@if [ "$(LINT)" = "1" ]; then \
	$(MAKE) lint-rs; \
	fi
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh reproducible"
	@/bin/echo -e "\033[0;32mReproducible WASM built successfully\033[0m"

# Generate ABIs
.PHONY: abi-rs
abi-rs: build-docker-rs ensure-scripts-executable
	@echo "Generating ABIs..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/abi.sh"
	@/bin/echo -e "\033[0;32mABIs generated successfully\033[0m"

# Inspect contract state
.PHONY: inspect-state-rs
inspect-state-rs: build-docker-rs ensure-scripts-executable
	@if [ -z "$(CONTRACT_ID)" ] || [ -z "$(METHOD)" ]; then \
	/bin/echo -e "\033[0;31mError: CONTRACT_ID and METHOD variables must be set (e.g., CONTRACT_ID=auth.sandbox METHOD=get_keys)\033[0m"; \
	exit 1; \
	fi
	@echo "Inspecting state for $(CONTRACT_ID)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/inspect_state.sh $(CONTRACT_ID) $(METHOD) '$(ARGS)'"
	@/bin/echo -e "\033[0;32mState inspected successfully\033[0m"

# Clean all artifacts and sandbox data
.PHONY: clean-all-rs
clean-all-rs: build-docker-rs ensure-scripts-executable
	@echo "Cleaning all Rust artifacts and sandbox data..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh clean-all"
	@$(MAKE) stop-sandbox
	@/bin/echo -e "\033[0;32mAll artifacts and sandbox data cleaned successfully\033[0m"

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
	@if ! docker ps | grep near-sandbox > /dev/null; then \
	$(MAKE) stop-sandbox; \
	if [ ! -d "$(CODE_DIR)/near-data" ]; then \
	$(MAKE) init-sandbox; \
	fi; \
	if lsof -i :3030 | grep LISTEN > /dev/null; then \
	/bin/echo -e "\033[0;31mError: Port 3030 is in use\033[0m"; \
	lsof -i :3030; \
	exit 1; \
	fi; \
	docker run -d --cap-add=SYS_ADMIN -p $(NEAR_SANDBOX_PORT):3030 --name near-sandbox -v $(CODE_DIR)/near-data:/tmp/near-sandbox -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "near-sandbox --home /tmp/near-sandbox run"; \
	for i in {1..30}; do \
	if curl -s http://localhost:3030/status > /dev/null; then \
	/bin/echo -e "\033[0;32mSandbox started successfully\033[0m"; \
	break; \
	fi; \
	/bin/echo "Waiting for sandbox..."; \
	sleep 2; \
	done; \
	if ! docker ps | grep near-sandbox > /dev/null; then \
	/bin/echo -e "\033[0;31mError: Sandbox failed to start\033[0m"; \
	docker logs near-sandbox; \
	exit 1; \
	fi; \
	if ! curl -s http://localhost:3030/status > /dev/null; then \
	/bin/echo -e "\033[0;31mError: Sandbox not responding\033[0m"; \
	docker logs near-sandbox; \
	exit 1; \
	fi; \
	else \
	/bin/echo -e "\033[0;32mSandbox already running\033[0m"; \
	fi

# Stop NEAR Sandbox
.PHONY: stop-sandbox
stop-sandbox:
	@echo "Stopping NEAR Sandbox..."
	@lsof -i :3030 | grep LISTEN | awk '{print $$2}' | xargs -r kill -9 || true
	@docker stop near-sandbox || true
	@docker rm near-sandbox || true
	@/bin/echo -e "\033[0;32mSandbox stopped\033[0m"

# Clean NEAR Sandbox
.PHONY: clean-sandbox
clean-sandbox:
	@echo "Cleaning NEAR Sandbox..."
	@docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/sandbox.sh clean"
	@$(MAKE) stop-sandbox
	@/bin/echo -e "\033[0;32mSandbox stopped and data cleaned\033[0m"

# Display NEAR Sandbox logs
.PHONY: logs-sandbox
logs-sandbox:
	@echo "Displaying NEAR Sandbox logs..."
	@docker logs near-sandbox || /bin/echo -e "\033[0;31mError: Sandbox container not found\033[0m"
	@/bin/echo -e "\033[0;32mSandbox logs displayed\033[0m"

# Patch sandbox state
.PHONY: patch-state-rs
patch-state-rs: start-sandbox
	@echo "Patching sandbox state..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e MASTER_ACCOUNT=$(AUTH_ACCOUNT) -e CONTRACT_ID=$(CONTRACT_ID) -e KEY=$(KEY) -e VALUE=$(VALUE) -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/patch_state.sh"
	@/bin/echo -e "\033[0;32mSandbox state patched successfully\033[0m"

# Define contract-specific targets dynamically
define CONTRACT_RULES
build-$1-rs: CONTRACT=$1
build-$1-rs: build-rs-contract

build-$1: build-$1-rs

test-all-$1-rs: CONTRACT=$1
test-all-$1-rs: test-all-rs

test-$1: test-all-$1-rs

test-unit-$1-rs: CONTRACT=$1
test-unit-$1-rs: test-unit-rs

test-integration-$1-rs: CONTRACT=$1
test-integration-$1-rs: test-integration-rs

test-coverage-$1-rs: CONTRACT=$1
test-coverage-$1-rs: test-coverage-rs

deploy-$1-rs: CONTRACT=$1
deploy-$1-rs: deploy-rs

deploy-init-$1-rs: CONTRACT=$1
deploy-init-$1-rs: deploy-init-rs

deploy-reproducible-$1-rs: CONTRACT=$1
deploy-reproducible-$1-rs: deploy-reproducible-rs

deploy-dry-run-$1-rs: CONTRACT=$1
deploy-dry-run-$1-rs: deploy-dry-run-rs

verify-contract-$1-rs: CONTRACT=$1
verify-contract-$1-rs: verify-contract-rs

format-$1-rs: CONTRACT=$1
format-$1-rs: format-rs-contract

lint-$1-rs: CONTRACT=$1
lint-$1-rs: lint-rs-contract
endef

$(foreach contract,$(VALID_CONTRACTS),$(eval $(call CONTRACT_RULES,$(contract))))

# JavaScript: Build packages
.PHONY: build-onsocial-js
build-onsocial-js: build-docker-js
	@echo "Building onsocial-js..."
	@if [ -d "packages/onsocial-js" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm --dir packages/onsocial-js build; \
	/bin/echo -e "\033[0;32monsocial-js built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/onsocial-js not found\033[0m"; \
	exit 1; \
	fi

.PHONY: build-app-js
build-app-js: build-docker-app
	@echo "Building app..."
	@if [ -d "packages/app" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) app-builder pnpm --dir packages/app build; \
	/bin/echo -e "\033[0;32mapp built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/app not found\033[0m"; \
	exit 1; \
	fi

.PHONY: build-relayer-js
build-relayer-js: build-docker-relayer
	@echo "Building relayer..."
	@if [ -d "packages/relayer" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) relayer-builder pnpm --dir packages/relayer build; \
	/bin/echo -e "\033[0;32mrelayer built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/relayer not found\033[0m"; \
	exit 1; \
	fi

# JavaScript: Build all packages
.PHONY: build-js
build-js: build-docker-js build-docker-app build-docker-relayer
	@echo "Building all JavaScript packages..."
	@$(MAKE) build-onsocial-js
	@$(MAKE) build-app-js
	@$(MAKE) build-relayer-js
	@/bin/echo -e "\033[0;32mAll JavaScript packages built successfully\033[0m"

# JavaScript: Test packages
.PHONY: test-onsocial-js
test-onsocial-js: build-docker-js
	@echo "Running onsocial-js tests..."
	@if [ -d "packages/onsocial-js" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm --dir packages/onsocial-js test > $(CODE_DIR)/packages/onsocial-js/test-logs.log 2>&1 || { cat $(CODE_DIR)/packages/onsocial-js/test-logs.log; /bin/echo -e "\033[0;31mTests failed\033[0m"; exit 1; }; \
	/bin/echo -e "\033[0;32monsocial-js tests completed successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/onsocial-js not found\033[0m"; \
	exit 1; \
	fi

.PHONY: test-app-js
test-app-js: build-docker-app
	@echo "Running app tests..."
	@if [ -d "packages/app" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) app-builder pnpm --dir packages/app test > $(CODE_DIR)/packages/app/test-logs.log 2>&1 || { cat $(CODE_DIR)/packages/app/test-logs.log; /bin/echo -e "\033[0;31mTests failed\033[0m"; exit 1; }; \
	/bin/echo -e "\033[0;32mapp tests completed successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/app not found\033[0m"; \
	exit 1; \
	fi

.PHONY: test-relayer-js
test-relayer-js: build-docker-relayer
	@echo "Running relayer tests..."
	@if [ -d "packages/relayer" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) relayer-builder pnpm --dir packages/relayer test > $(CODE_DIR)/packages/relayer/test-logs.log 2>&1 || { cat $(CODE_DIR)/packages/relayer/test-logs.log; /bin/echo -e "\033[0;31mTests failed\033[0m"; exit 1; }; \
	/bin/echo -e "\033[0;32mrelayer tests completed successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/relayer not found\033[0m"; \
	exit 1; \
	fi

# JavaScript: Test all packages
.PHONY: test-js
test-js: build-docker-js build-docker-app build-docker-relayer
	@echo "Running tests for all JavaScript packages..."
	@$(MAKE) test-onsocial-js
	@$(MAKE) test-app-js
	@$(MAKE) test-relayer-js
	@/bin/echo -e "\033[0;32mAll JavaScript tests completed successfully\033[0m"

# JavaScript: Lint packages
.PHONY: lint-onsocial-js
lint-onsocial-js: build-docker-js
	@echo "Linting onsocial-js..."
	@if [ -d "packages/onsocial-js" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm --dir packages/onsocial-js lint; \
	/bin/echo -e "\033[0;32monsocial-js linted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/onsocial-js not found\033[0m"; \
	exit 1; \
	fi

.PHONY: lint-app-js
lint-app-js: build-docker-app
	@echo "Linting app..."
	@if [ -d "packages/app" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) app-builder pnpm --dir packages/app lint; \
	/bin/echo -e "\033[0;32mapp linted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/app not found\033[0m"; \
	exit 1; \
	fi

.PHONY: lint-relayer-js
lint-relayer-js: build-docker-relayer
	@echo "Linting relayer..."
	@if [ -d "packages/relayer" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) relayer-builder pnpm --dir packages/relayer lint; \
	/bin/echo -e "\033[0;32mrelayer linted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/relayer not found\033[0m"; \
	exit 1; \
	fi

# JavaScript: Lint all packages
.PHONY: lint-js
lint-js: build-docker-js build-docker-app build-docker-relayer
	@echo "Linting all JavaScript packages..."
	@$(MAKE) lint-onsocial-js
	@$(MAKE) lint-app-js
	@$(MAKE) lint-relayer-js
	@/bin/echo -e "\033[0;32mAll JavaScript packages linted successfully\033[0m"

# JavaScript: Format packages
.PHONY: format-onsocial-js
format-onsocial-js: build-docker-js
	@echo "Formatting onsocial-js..."
	@if [ -d "packages/onsocial-js" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm --dir packages/onsocial-js format; \
	/bin/echo -e "\033[0;32monsocial-js formatted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/onsocial-js not found\033[0m"; \
	exit 1; \
	fi

.PHONY: format-app-js
format-app-js: build-docker-app
	@echo "Formatting app..."
	@if [ -d "packages/app" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) app-builder pnpm --dir packages/app format; \
	/bin/echo -e "\033[0;32mapp formatted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/app not found\033[0m"; \
	exit 1; \
	fi

.PHONY: format-relayer-js
format-relayer-js: build-docker-relayer
	@echo "Formatting relayer..."
	@if [ -d "packages/relayer" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) relayer-builder pnpm --dir packages/relayer format; \
	/bin/echo -e "\033[0;32mrelayer formatted successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/relayer not found\033[0m"; \
	exit 1; \
	fi

# JavaScript: Format all packages
.PHONY: format-js
format-js: build-docker-js build-docker-app build-docker-relayer
	@echo "Formatting all JavaScript packages..."
	@$(MAKE) format-onsocial-js
	@$(MAKE) format-app-js
	@$(MAKE) format-relayer-js
	@/bin/echo -e "\033[0;32mAll JavaScript packages formatted successfully\033[0m"

# JavaScript: Start app
.PHONY: start-app-js
start-app-js: build-docker-app
	@echo "Starting app..."
	@if [ -d "packages/app" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --network host --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) app-builder pnpm --dir packages/app start; \
	/bin/echo -e "\033[0;32mApp started\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/app not found\033[0m"; \
	exit 1; \
	fi

# JavaScript: Start relayer
.PHONY: start-relayer-js
start-relayer-js: build-docker-relayer
	@echo "Starting relayer..."
	@if [ -d "packages/relayer" ]; then \
	docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --network host --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) relayer-builder pnpm --dir packages/relayer start; \
	/bin/echo -e "\033[0;32mRelayer started\033[0m"; \
	else \
	/bin/echo -e "\033[0;31mError: packages/relayer not found\033[0m"; \
	exit 1; \
	fi

# Default build target (alias for build-rs)
.PHONY: build
build: build-rs
	@/bin/echo -e "\033[0;32mBuild completed successfully\033[0m"

# Help
.PHONY: help
help:
	@echo "OnSocial Contracts Monorepo Makefile"
	@echo ""
	@echo "Usage: make [target] [VARIABLE=value]"
	@echo ""
	@echo "Core Rust Contract Targets:"
	@echo "  all                  Build and test all Rust contracts (default)"
	@echo "  build                Build all Rust contracts (alias for build-rs)"
	@echo "  build-rs             Build all Rust contracts"
	@echo "  test-rs              Run all unit and integration tests"
	@echo "  test-all-contracts   Run all tests for all contracts"
	@echo "  build-reproducible-rs Build reproducible WASM for mainnet"
	@echo "  abi-rs               Generate ABIs for all contracts"
	@echo ""
	@echo "Contract-Specific Rust Targets (replace <contract> with auth-onsocial, ft-wrapper-onsocial, etc.):"
	@echo "  build-<contract>-rs     Build a specific contract (e.g., build-relayer-onsocial-rs)"
	@echo "  test-<contract>         Run all tests for a specific contract (e.g., test-relayer-onsocial)"
	@echo "  test-unit-<contract>-rs Run unit tests (e.g., test-unit-relayer-onsocial-rs)"
	@echo "  test-integration-<contract>-rs Run integration tests (e.g., test-integration-relayer-onsocial-rs)"
	@echo "  test-coverage-<contract>-rs Generate test coverage (e.g., test-coverage-relayer-onsocial-rs)"
	@echo "  deploy-<contract>-rs    Deploy a contract to sandbox (e.g., deploy-relayer-onsocial-rs)"
	@echo "  deploy-init-<contract>-rs Initialize a deployed contract (e.g., deploy-init-relayer-onsocial-rs)"
	@echo "  deploy-reproducible-<contract>-rs Deploy with reproducible WASM"
	@echo "  deploy-dry-run-<contract>-rs Simulate deployment"
	@echo "  verify-contract-<contract>-rs Verify a contract (e.g., verify-contract-relayer-onsocial-rs)"
	@echo "  format-<contract>-rs    Format a specific contract (e.g., format-auth-onsocial-rs)"
	@echo "  lint-<contract>-rs      Lint a specific contract (e.g., lint-relayer-onsocial-rs)"
	@echo ""
	@echo "Rust Formatting and Linting Targets:"
	@echo "  format-rs            Format all Rust contracts"
	@echo "  format-all-rs        Format all Rust contracts (alias for format-rs)"
	@echo "  lint-rs              Lint all Rust contracts"
	@echo "  lint-all-rs          Lint all Rust contracts (alias for lint-rs)"
	@echo ""
	@echo "Advanced Rust Targets:"
	@echo "  build-rs-contract    Build a specific contract (CONTRACT=contract-name)"
	@echo "  test-all-rs          Run all tests for all or specific contract (CONTRACT=contract-name)"
	@echo "  test-unit-rs         Run unit tests for all or specific contract (CONTRACT=contract-name)"
	@echo "  test-integration-rs  Run integration tests for all or specific contract (CONTRACT=contract-name)"
	@echo "  test-coverage-rs     Generate test coverage report (CONTRACT=contract-name)"
	@echo "  deploy-rs            Deploy a contract (CONTRACT=contract-name, NETWORK=network)"
	@echo "  deploy-init-rs       Initialize a deployed contract (CONTRACT=contract-name)"
	@echo "  deploy-reproducible-rs Deploy with reproducible WASM (CONTRACT=contract-name)"
	@echo "  deploy-dry-run-rs    Simulate deployment (CONTRACT=contract-name, NETWORK=network)"
	@echo "  verify-contract-rs   Verify a specific contract (CONTRACT=contract-name)"
	@echo "  build-docker-rs      Build Docker image for Rust contracts"
	@echo "  rebuild-docker-rs    Force rebuild Docker image for Rust contracts"
	@echo "  cargo-update-rs      Clean and update Cargo dependencies"
	@echo "  upgrade-deps-rs      Upgrade Rust dependencies"
	@echo "  format-rs            Format Rust code"
	@echo "  lint-rs              Lint Rust code"
	@echo "  check-rs             Check Rust workspace syntax"
	@echo "  audit-rs             Audit Rust dependencies for vulnerabilities"
	@echo "  check-deps-rs        Check Rust dependency tree"
	@echo "  clean-all-rs         Clean all Rust artifacts and sandbox data"
	@echo "  inspect-state-rs     Inspect contract state (CONTRACT_ID=id, METHOD=method, ARGS=args)"
	@echo "  patch-state-rs       Patch sandbox state (CONTRACT_ID=id, KEY=key, VALUE=value)"
	@echo ""
	@echo "Sandbox Targets:"
	@echo "  init-sandbox         Initialize NEAR Sandbox"
	@echo "  start-sandbox        Start NEAR Sandbox"
	@echo "  stop-sandbox         Stop NEAR Sandbox"
	@echo "  clean-sandbox        Clean NEAR Sandbox data"
	@echo "  logs-sandbox         Display NEAR Sandbox logs"
	@echo ""
	@echo "JavaScript Targets:"
	@echo "  clean-install-js     Clean and reinstall JavaScript dependencies"
	@echo "  clean-docker-js      Clean all JavaScript Docker images, volumes, and unused artifacts"
	@echo "  build-js             Build all JavaScript packages"
	@echo "  build-onsocial-js    Build onsocial-js package"
	@echo "  build-app-js         Build app package"
	@echo "  build-relayer-js     Build relayer package"
	@echo "  test-js              Test all JavaScript packages"
	@echo "  test-onsocial-js     Test onsocial-js package"
	@echo "  test-app-js          Test app package"
	@echo "  test-relayer-js      Test relayer package"
	@echo "  lint-js              Lint all JavaScript packages"
	@echo "  lint-onsocial-js     Lint onsocial-js package"
	@echo "  lint-app-js          Lint app package"
	@echo "  lint-relayer-js      Lint relayer package"
	@echo "  format-js            Format all JavaScript packages"
	@echo "  format-onsocial-js   Format onsocial-js package"
	@echo "  format-app-js        Format app package"
	@echo "  format-relayer-js    Format relayer package"
	@echo "  start-app-js         Start app (mobile/web)"
	@echo "  start-relayer-js     Start relayer server"
	@echo "  build-docker-js      Build Docker image for onsocial-js and dependency updates"
	@echo "  rebuild-docker-js    Force rebuild Docker image for onsocial-js"
	@echo "  build-docker-app     Build Docker image for app"
	@echo "  rebuild-docker-app   Force rebuild Docker image for app"
	@echo "  build-docker-relayer Build Docker image for relayer"
	@echo "  rebuild-docker-relayer Force rebuild Docker image for relayer"
	@echo "  upgrade-deps-js      Upgrade JavaScript dependencies to latest versions"
	@echo ""
	@echo "Variables:"
	@echo "  NETWORK              Network to deploy to (sandbox, testnet, mainnet; default: sandbox)"
	@echo "  AUTH_ACCOUNT         Account for auth-onsocial (default: test.near)"
	@echo "  FT_ACCOUNT           Account for ft-wrapper-onsocial (default: test.near)"
	@echo "  RELAYER_ACCOUNT      Account for relayer-onsocial (default: test.near)"
	@echo "  CONTRACT             Contract name (e.g., relayer-onsocial)"
	@echo "  CONTRACT_ID          Contract ID for state inspection (e.g., relayer.sandbox)"
	@echo "  METHOD               View method for state inspection (e.g., get_keys)"
	@echo "  ARGS                 JSON args for view method (e.g., {\"account_id\": \"test.near\"})"
	@echo "  NEAR_NODE_URL        NEAR node URL (default: http://localhost:3030)"
	@echo "  LINT                 Set to 1 to enable linting during build (e.g., LINT=1)"
	@echo "  VERBOSE              Set to 1 to enable detailed output (e.g., VERBOSE=1)"
	@echo "  DRY_RUN              Set to 1 to simulate deployment (e.g., DRY_RUN=1)"
	@echo "  INCOMPATIBLE         Set to 1 to include incompatible dependency upgrades (e.g., INCOMPATIBLE=1)"
	@echo ""
	@echo "Examples:"
	@echo "  make clean-install-js               # Clean and reinstall JavaScript dependencies"
	@echo "  make clean-docker-js                # Clean all JavaScript Docker images and volumes"
	@echo "  make build-relayer-onsocial-rs         # Build relayer-onsocial contract"
	@echo "  make test-relayer-onsocial             # Run all tests for auth-onsocial"
	@echo "  make deploy-auth-onsocial-rs        # Deploy relayer-onsocial to sandbox"
	@echo "  make deploy-rs CONTRACT=social-onsocial NETWORK=testnet  # Deploy to testnet"
	@echo "  make test-all-contracts             # Run all tests for all contracts"
	@echo "  make build-js                       # Build all JavaScript packages"
	@echo "  make test-js                        # Run all JavaScript tests"
	@echo "  make start-app-js                   # Start the app"
	@echo "  make format-relayer-onsocial-rs        # Format auth-onsocial contract"
	@echo "  make lint-relayer-onsocial-rs          # Lint auth-onsocial contract"
	@echo "  make format-all-rs                  # Format all Rust contracts"
	@echo "  make lint-all-rs                    # Lint all Rust contracts"
	@echo "  make upgrade-deps-js                # Upgrade all JavaScript dependencies"