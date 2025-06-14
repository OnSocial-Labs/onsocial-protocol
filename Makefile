.DEFAULT_GOAL := help

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
RS_DOCKER_IMAGE := relayer-builder
CODE_DIR := $(shell pwd)
NEAR_SANDBOX_PORT := 3030
NEAR_NODE_URL ?= http://localhost:3030
VERBOSE ?= 0
DRY_RUN ?= 0
VALID_CONTRACTS := ft-wrapper-onsocial social-onsocial marketplace-onsocial staking-onsocial
JS_PACKAGES := onsocial-js app
RS_PACKAGES := relayer

# Relayer Docker variables
RELAYER_CONTAINER_NAME ?= relayer
RELAYER_PORT ?= 3040
RELAYER_CONFIG_PATH ?= $(CODE_DIR)/packages/relayer/config.toml
RELAYER_KEYS_PATH ?= $(CODE_DIR)/packages/relayer/account_keys
RELAYER_DOCKER_IMAGE ?= $(RS_DOCKER_IMAGE)

# Default target
.PHONY: all
all: build-rs test-rs

# Ensure all scripts are executable
.PHONY: ensure-scripts-executable
ensure-scripts-executable:
	@echo "Ensuring scripts are executable..."
	@chmod +x scripts/*.sh
	@/bin/echo -e "\033[0;32mScripts permissions set successfully\033[0m"

# Clean and reinstall JavaScript dependencies
.PHONY: clean-install-js
clean-install-js: clean-docker-js rebuild-docker-onsocial-js ensure-scripts-executable
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
.PHONY: build-docker-onsocial-js
build-docker-onsocial-js: ensure-scripts-executable
	@echo "Checking for existing Docker image $(JS_DOCKER_IMAGE)..."
	@if ! docker images -q $(JS_DOCKER_IMAGE) | grep -q .; then \
	/bin/echo "Building Docker image $(JS_DOCKER_IMAGE)..."; \
	docker build -t $(JS_DOCKER_IMAGE) -f docker/Dockerfile.onsocial-js .; \
	/bin/echo -e "\033[0;32mDocker image built successfully\033[0m"; \
	else \
	/bin/echo -e "\033[0;32mDocker image $(JS_DOCKER_IMAGE) already exists\033[0m"; \
	fi

# Force rebuild Docker image for JavaScript (onsocial-js)
.PHONY: rebuild-docker-onsocial-js
rebuild-docker-onsocial-js: ensure-scripts-executable
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

# Universal pattern rules for contract actions
.PHONY: build-%-rs
build-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Building Rust contract $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "./scripts/build.sh build-contract $*"; \
	else \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh build-contract $*"; \
	fi
	@/bin/echo -e "\033[0;32mRust contract $* built successfully\033[0m"

.PHONY: test-%-rs
# Runs all tests (unit+integration) for a contract
# (test-all-%-rs is kept as an alias for backward compatibility)
test-%-rs: test-all-%-rs

.PHONY: test-all-%-rs
test-all-%-rs: build-docker-rs ensure-scripts-executable start-sandbox
	@echo "Running all unit and integration tests for $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) \
	bash -c 'set -o pipefail; ./scripts/test.sh all $* 2>&1 | tee /code/test-all.log'; \
	else \
		docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) \
	bash -c 'set -o pipefail; ./scripts/test.sh all $* 2>&1 | tee /code/test-all.log'; \
	fi
	@if [ $$? -ne 0 ]; then \
		echo -e '\033[0;31mTests failed\033[0m'; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mAll tests for $* completed successfully\033[0m"
	@$(MAKE) stop-sandbox

.PHONY: test-unit-%-rs
test-unit-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Running unit tests for $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run \
			-v $(CODE_DIR):/code \
			-w /code/packages/relayer \
			--rm -e VERBOSE=$(VERBOSE) \
			$(RS_DOCKER_IMAGE) \
			cargo test --all --locked --release -- --nocapture; \
	else \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh unit $*"; \
	fi
	@/bin/echo -e "\033[0;32mUnit tests for $* completed successfully\033[0m"

.PHONY: test-integration-%-rs
test-integration-%-rs: build-docker-rs ensure-scripts-executable start-sandbox
	@echo "Running integration tests for $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "./scripts/test.sh integration $*"; \
	else \
		docker run -v $(CODE_DIR):/code --network host --cap-add=SYS_ADMIN --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test.sh integration $*"; \
	fi
	@/bin/echo -e "\033[0;32mIntegration tests for $* completed successfully\033[0m"
	@$(MAKE) stop-sandbox

.PHONY: test-coverage-%-rs
test-coverage-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Generating test coverage report for $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --network host --privileged --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "./scripts/test_coverage.sh $*"; \
	else \
		docker run -v $(CODE_DIR):/code --network host --privileged --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/test_coverage.sh $*"; \
	fi
	@/bin/echo -e "\033[0;32mTest coverage report for $* generated successfully\033[0m"

.PHONY: check-%-rs
check-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Checking Rust contract $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "./scripts/build.sh check-contract $*"; \
	else \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh check-contract $*"; \
	fi
	@/bin/echo -e "\033[0;32mRust contract $* checked successfully\033[0m"

.PHONY: lint-%-rs
lint-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Linting Rust contract $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "./scripts/build.sh lint-contract $*"; \
	else \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh lint-contract $*"; \
	fi
	@/bin/echo -e "\033[0;32mRust contract $* linted successfully\033[0m"

.PHONY: format-%-rs
format-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Formatting Rust contract $*..."
	@if [ -d "contracts/$*" ]; then \
		if [ "$*" = "relayer" ]; then \
			docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd contracts/$* && cargo fmt"; \
		else \
			docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo fmt"; \
		fi; \
	elif [ -d "packages/$*" ]; then \
		if [ "$*" = "relayer" ]; then \
			docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo fmt"; \
		else \
			docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo fmt"; \
		fi; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust contract $* formatted successfully\033[0m"

.PHONY: twiggy-%-rs
twiggy-%-rs: build-%-rs
	@echo "Running twiggy top for contract: $* (WASM bloat analysis)"
	@NAME_UNDERSCORE=$(shell echo $* | tr '-' '_'); \
	WASM1=target/near/$$NAME_UNDERSCORE/$$NAME_UNDERSCORE.wasm; \
	WASM2=target/wasm32-unknown-unknown/release/$$NAME_UNDERSCORE.wasm; \
	if [ -f "$$WASM1" ]; then \
		echo "Using $$WASM1"; \
		docker run -it --rm -v $(PWD):/code -w /code $(DOCKER_IMAGE) bash -c "twiggy top -n 50 $$WASM1"; \
	elif [ -f "$$WASM2" ]; then \
		echo "Using $$WASM2"; \
		docker run -it --rm -v $(PWD):/code -w /code $(DOCKER_IMAGE) bash -c "twiggy top -n 50 $$WASM2"; \
	else \
		echo "Error: Neither $$WASM1 nor $$WASM2 exists. Build the contract first."; \
		exit 1; \
	fi

.PHONY: audit-%-rs
audit-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Auditing Rust contract $*..."
	@if [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo audit"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo audit"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust contract $* audited successfully\033[0m"

.PHONY: deploy-%-rs
deploy-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Deploying contract $* to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $*"
	@/bin/echo -e "\033[0;32mContract $* deployed successfully\033[0m"

.PHONY: deploy-init-%-rs
deploy-init-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Initializing contract $* on $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh init --contract $*"
	@/bin/echo -e "\033[0;32mContract $* initialized successfully\033[0m"

.PHONY: deploy-reproducible-%-rs
deploy-reproducible-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Deploying contract $* with reproducible WASM to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=$(DRY_RUN) $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh reproducible --contract $*"
	@/bin/echo -e "\033[0;32mContract $* deployed with reproducible WASM successfully\033[0m"

.PHONY: deploy-dry-run-%-rs
deploy-dry-run-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Simulating deployment of $* to $(NETWORK)..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e AUTH_ACCOUNT=$(AUTH_ACCOUNT) -e FT_ACCOUNT=$(FT_ACCOUNT) -e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) -e NEAR_NODE_URL=$(NEAR_NODE_URL) -e VERBOSE=$(VERBOSE) -e DRY_RUN=1 $(DOCKER_IMAGE) bash -c "./scripts/deploy.sh --contract $*"
	@/bin/echo -e "\033[0;32mDry-run deployment simulation for $* completed successfully\033[0m"

.PHONY: verify-contract-%-rs
verify-contract-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Verifying contract $*..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/build.sh verify $*"
	@/bin/echo -e "\033[0;32mContract $* verified successfully\033[0m"

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
	for i in {1..60}; do \
	if curl -s http://localhost:3030/status > /dev/null; then \
	/bin/echo -e "\033[0;32mSandbox started successfully\033[0m"; \
break; \
	fi; \
	/bin/echo "Waiting for sandbox... ($$i/60)"; \
sleep 6; \
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
	@/bin/echo -e "\033[0;32mLogs displayed successfully\033[0m"

# Patch sandbox state
.PHONY: patch-state-rs
patch-state-rs: start-sandbox
	@echo "Patching sandbox state..."
	@docker run -v $(CODE_DIR):/code --network host --rm -e NETWORK=$(NETWORK) -e MASTER_ACCOUNT=$(AUTH_ACCOUNT) -e CONTRACT_ID=$(CONTRACT_ID) -e KEY=$(KEY) -e VALUE=$(VALUE) -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "./scripts/patch_state.sh"
	@/bin/echo -e "\033[0;32mSandbox state patched successfully\033[0m"

# Relayer commands (build, test, lint, format, etc.)
# Removed: build-relayer, test-relayer, lint-relayer, format-relayer, relayer-%
# Use only the -rs variants for relayer Rust package tasks.

# Run cargo clippy for a specific Rust contract
.PHONY: clippy-%-rs
clippy-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Running cargo clippy for: $*..."
	@if [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo clippy --all-targets --all-features -- -D warnings"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo clippy --all-targets --all-features -- -D warnings"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mClippy finished for $* successfully\033[0m"

# Run cargo doc for a specific Rust contract
.PHONY: doc-%-rs
doc-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Building documentation for contract: $*..."
	@if [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo doc --no-deps --all-features"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo doc --no-deps --all-features"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mDocumentation for $* built successfully\033[0m"

# Show dependency tree for a specific Rust contract
.PHONY: tree-%-rs
tree-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Showing dependency tree for contract: $*..."
	@if [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo tree --all-features"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo tree --all-features"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mDependency tree for $* displayed successfully\033[0m"

# Show outdated dependencies for a specific Rust contract
.PHONY: outdated-%-rs
outdated-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Checking for outdated dependencies in contract: $*..."
	@if [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo outdated --workspace || true"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo outdated --workspace || true"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mOutdated dependencies for $* checked successfully\033[0m"

# Pattern rule to map JS package names to their docker build targets
build-docker-onsocial-js: build-docker-onsocial-js
build-docker-app: build-docker-app
build-docker-relayer: build-docker-relayer

# Pattern rules for JavaScript package tasks (with -js suffix)
.PHONY: build-%-js test-%-js lint-%-js format-%-js

build-%-js: build-docker-%
	@echo "Building JS package $*..."
	@if [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $*-builder pnpm --dir packages/$* build; \
		/bin/echo -e "\033[0;32m$* built successfully\033[0m"; \
	else \
		/bin/echo -e "\033[0;31mError: packages/$* not found\033[0m"; \
		exit 1; \
	fi

test-%-js: build-docker-%
	@echo "Running JS package $* tests..."
	@if [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $*-builder pnpm --dir packages/$* test > $(CODE_DIR)/packages/$*/test-logs.log 2>&1 || { cat $(CODE_DIR)/packages/$*/test-logs.log; /bin/echo -e "\033[0;31mTests failed\033[0m"; exit 1; }; \
		/bin/echo -e "\033[0;32m$* tests completed successfully\033[0m"; \
	else \
		/bin/echo -e "\033[0;31mError: packages/$* not found\033[0m"; \
		exit 1; \
	fi

lint-%-js: build-docker-%
	@echo "Linting JS package $*..."
	@if [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $*-builder pnpm --dir packages/$* lint; \
		/bin/echo -e "\033[0;32m$* linted successfully\033[0m"; \
	else \
		/bin/echo -e "\033[0;31mError: packages/$* not found\033[0m"; \
		exit 1; \
	fi

format-%-js: build-docker-%
	@echo "Formatting JS package $*..."
	@if [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $*-builder pnpm --dir packages/$* format; \
		/bin/echo -e "\033[0;32m$* formatted successfully\033[0m"; \
	else \
		/bin/echo -e "\033[0;31mError: packages/$* not found\033[0m"; \
		exit 1; \
	fi

# Meta targets for all JS packages (with -js suffix)
.PHONY: build-js test-js lint-js format-js
build-js: $(addsuffix -js,$(addprefix build-,$(JS_PACKAGES)))
	@/bin/echo -e "\033[0;32mAll JavaScript packages built successfully\033[0m"
test-js: $(addsuffix -js,$(addprefix test-,$(JS_PACKAGES)))
	@/bin/echo -e "\033[0;32mAll JavaScript tests completed successfully\033[0m"
lint-js: $(addsuffix -js,$(addprefix lint-,$(JS_PACKAGES)))
	@/bin/echo -e "\033[0;32mAll JavaScript packages linted successfully\033[0m"
format-js: $(addsuffix -js,$(addprefix format-,$(JS_PACKAGES)))
	@/bin/echo -e "\033[0;32mAll JavaScript packages formatted successfully\033[0m"

# Help
.PHONY: help
help:
	@echo "OnSocial Contracts Monorepo Makefile"
	@echo ""
	@echo "Usage: make [target]"
	@echo ""
	@echo "Core Rust Contract Targets:"
	@echo "  build-rs                Build all Rust contracts (alias for build-all-contracts-rs)"
	@echo "  test-rs                 Test all Rust contracts (alias for test-all-contracts-rs)"
	@echo "  lint-rs                 Lint all Rust contracts"
	@echo "  format-rs               Format all Rust contracts"
	@echo "  check-rs                Check all Rust contracts"
	@echo "  audit-rs                Audit all Rust contracts"
	@echo "  clean-all-rs            Clean all Rust artifacts and sandbox data"
	@echo "  cargo-update-rs         Clean and update Cargo dependencies"
	@echo "  upgrade-deps-rs         Upgrade Rust dependencies"
	@echo ""
	@echo "Universal Rust Contract Pattern Targets (replace <action> and <contract>):"
	@echo "  <action>-<contract>-rs  Run <action> for a contract. Actions include:"
	@echo "    build, test, check, lint, format, fix, audit, deploy, clippy, doc, tree, outdated, etc."
	@echo "    e.g., build-relayer-onsocial-rs, clippy-relayer-onsocial-rs, doc-relayer-onsocial-rs, tree-relayer-onsocial-rs, outdated-relayer-onsocial-rs, ..."
	@echo ""
	@echo "  clippy-<contract>-rs    Run cargo clippy (lints with warnings as errors)"
	@echo "  doc-<contract>-rs       Build Rust documentation for the contract"
	@echo "  tree-<contract>-rs      Show dependency tree for the contract"
	@echo "  outdated-<contract>-rs  Check for outdated dependencies in the contract"
	@echo ""
	@echo "Examples:"
	@echo "  make clippy-social-onsocial-rs         # Run cargo clippy for social-onsocial contract"
	@echo "  make doc-social-onsocial-rs            # Build docs for social-onsocial contract"
	@echo "  make tree-social-onsocial-rs           # Show dependency tree for social-onsocial contract"
	@echo "  make outdated-social-onsocial-rs       # Check for outdated dependencies in social-onsocial contract"
	@echo "  make build-social-onsocial-rs          # Build social-onsocial contract"
	@echo "  make test-social-onsocial-rs           # Run all tests for social-onsocial"
	@echo "  make lint-social-onsocial-rs           # Lint social-onsocial contract"
	@echo "  make fix-social-onsocial-rs            # Run cargo fix for social-onsocial"
	@echo "  make twiggy-social-onsocial-rs          # Run twiggy WASM bloat analysis for social-onsocial"
	@echo "  make audit-social-onsocial-rs          # Audit social-onsocial contract"
	@echo "  make deploy-social-onsocial-rs         # Deploy social-onsocial to sandbox"
	@echo "  make format-all-rs                      # Format all Rust contracts"
	@echo "  make lint-all-rs                        # Lint all Rust contracts"
	@echo "  make test-all-contracts                 # Run all tests for all contracts"
	@echo "  make build-js                           # Build all JavaScript packages"
	@echo "  make test-js                            # Run all JavaScript tests"
	@echo "  make lint-js                            # Lint all JavaScript packages"
	@echo "  make format-js                          # Format all JavaScript packages"
	@echo "  make start-app-js                       # Start the app"
	@echo "  make upgrade-deps-js                    # Upgrade all JavaScript dependencies"
	@echo ""
	@echo "Relayer Rust Package Targets:"
	@echo "  build-relayer-rs          Build the relayer Rust package"
	@echo "  run-relayer-rs            Run the relayer Rust package"
	@echo "  test-relayer-rs           Test the relayer Rust package"
	@echo "  lint-relayer-rs           Lint the relayer Rust package"
	@echo "  format-relayer-rs         Format the relayer Rust package"
	@echo "  clippy-relayer-rs         Run cargo clippy for the relayer Rust package"
	@echo "  doc-relayer-rs            Build documentation for the relayer Rust package"
	@echo "  audit-relayer-rs          Audit the relayer Rust package"
	@echo "  clean-relayer-rs          Clean the relayer Rust package"
	@echo ""
	@echo "Docker Commands for Relayer:"
	@echo "  docker-build-relayer      Build the relayer Docker image"
	@echo "  docker-run-relayer        Run the relayer Docker container"
	@echo "  docker-stop-relayer       Stop and remove the relayer Docker container"
	@echo "  docker-logs-relayer       View logs for the relayer Docker container"
	@echo "  docker-shell-relayer      Access the relayer Docker container shell"

.PHONY: run-%-rs
run-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Running Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo run"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo run"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo run"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust package $* is running\033[0m"

.PHONY: clean-%-rs
clean-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Cleaning Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo clean"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo clean"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo clean"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust package $* cleaned successfully\033[0m"

.PHONY: fix-%-rs
fix-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Running cargo fix for Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo fix --allow-dirty"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo fix --allow-dirty"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo fix --allow-dirty"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mCargo fix for $* completed successfully\033[0m"

.PHONY: release-%-rs
release-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Building release for Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo build --release"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo build --release"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo build --release"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRelease build for $* completed successfully\033[0m"

.PHONY: publish-%-rs
publish-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Publishing Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo publish"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo publish"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo publish"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust package $* published successfully\033[0m"

.PHONY: install-%-rs
install-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Installing Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo install --path ."; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo install --path ."; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo install --path ."; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mRust package $* installed successfully\033[0m"

.PHONY: update-%-rs
update-%-rs: build-docker-rs ensure-scripts-executable
	@echo "Updating dependencies for Rust package $*..."
	@if [ "$*" = "relayer" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(RS_DOCKER_IMAGE) bash -c "cd packages/$* && cargo update"; \
	elif [ -d "contracts/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd contracts/$* && cargo update"; \
	elif [ -d "packages/$*" ]; then \
		docker run -v $(CODE_DIR):/code --rm -e VERBOSE=$(VERBOSE) $(DOCKER_IMAGE) bash -c "cd packages/$* && cargo update"; \
	else \
		echo "Error: neither contracts/$* nor packages/$* exists."; \
		exit 1; \
	fi
	@/bin/echo -e "\033[0;32mDependencies for $* updated successfully\033[0m"

.PHONY: docker-run-%
docker-run-%: build-docker-%
	@echo "Running Docker container for $*..."
	CONTAINER_NAME=$*; \
	if [ "$*" = "relayer" ]; then \
	  PORT=3040; \
	else \
	  PORT=$(RELAYER_PORT); \
	fi; \
	CONFIG_PATH=$(CODE_DIR)/packages/$$CONTAINER_NAME/config.toml; \
	KEYS_PATH=$(CODE_DIR)/packages/$$CONTAINER_NAME/account_keys; \
	IMAGE_NAME=$*-builder; \
	docker run -d --name $$CONTAINER_NAME -p $$PORT:3030 -v $$CONFIG_PATH:/relayer-app/config.toml -v $$KEYS_PATH:/relayer-app/account_keys $$IMAGE_NAME; \
	/bin/echo -e "\033[0;32mDocker container $$CONTAINER_NAME started\033[0m"

.PHONY: docker-stop-%
docker-stop-%:
	@echo "Stopping and removing Docker container for $*..."
	docker stop $* || true
	docker rm $* || true
	@/bin/echo -e "\033[0;32mDocker container $* stopped and removed\033[0m"

.PHONY: docker-logs-%
docker-logs-%:
	@echo "Showing logs for Docker container $*..."
	docker logs $* || true
	@/bin/echo -e "\033[0;32mDocker logs for $* displayed\033[0m"

.PHONY: docker-shell-%
docker-shell-%:
	@echo "Opening shell in Docker container $*..."
	docker exec -it $* /bin/bash || true
	@/bin/echo -e "\033[0;32mShell opened in Docker container $*\033[0m"

.PHONY: keys-relayer
keys-relayer:
	bash packages/relayer/multikey_setup.sh

# Universal test-unit-% rule for contracts and packages
.PHONY: test-unit-%
test-unit-%:
	@if echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		$(MAKE) test-unit-$*-rs; \
	elif echo "$(JS_PACKAGES)" | grep -wq "$*"; then \
		$(MAKE) test-$*-js; \
	elif echo "$(RS_PACKAGES)" | grep -wq "$*"; then \
		$(MAKE) test-unit-$*-rs; \
	else \
		echo "Unknown contract or package: $*"; \
		exit 1; \
	fi

.PHONY: test-unit-relayer
# Run relayer unit tests inside Docker
# Requires build-docker-rs and ensure-scripts-executable targets
# Uses $(CODE_DIR) as the project root and $(RS_DOCKER_IMAGE) as the Rust Docker image

test-unit-relayer: build-docker-rs ensure-scripts-executable
	@echo "Running unit tests for relayer (Rust) in Docker..."
	docker run --rm \
		-v $(CODE_DIR):/code \
		-w /code/packages/relayer \
		-e VERBOSE=$(VERBOSE) \
		$(RS_DOCKER_IMAGE) \
		cargo test tests --locked --release -- --nocapture
	@/bin/echo -e "\033[0;32mUnit tests for relayer completed successfully\033[0m"

# Build a docker-compose service by name: make build-<service>
.PHONY: build-%
build-%:
	@echo "Building docker-compose service '$*'..."
	docker-compose build $*
	@/bin/echo -e "\033[0;32mService '$*' built successfully\033[0m"