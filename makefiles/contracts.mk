# =============================================================================
# CONTRACT TARGETS
# =============================================================================
# OnSocial Protocol - Contract Build, Test, and Deployment Targets
# 
# Note: This file should only be included from the main Makefile
# Variables and functions are provided by variables.mk and docker.mk

# =============================================================================
# CONTRACT BUILD TARGETS
# =============================================================================

.PHONY: build-all-contracts
build-all-contracts: build-docker-contracts ensure-scripts-executable
	$(call log_start,Building All Contracts)
	$(call log_progress,Building all contracts with optimized WASM)
	$(call docker_run_contracts,./scripts/build.sh)
	$(call log_success,All contracts built successfully)

.PHONY: build-contract-%
build-contract-%: build-docker-contracts ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		echo "❌ Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)"; \
		exit 1; \
	fi
	@echo "🚀 Starting: Building Contract $*..."
	$(call docker_run_contracts,./scripts/build.sh build-contract $*)
	@echo "✅ Contract $* built successfully"

# =============================================================================
# CONTRACT TESTING TARGETS
# =============================================================================

.PHONY: test-all-contracts
test-all-contracts: build-docker-contracts ensure-scripts-executable
	$(call log_start,Running All Contract Tests)
	$(call log_progress,Running comprehensive test suite)
	$(call docker_run_contracts_network,set -o pipefail; ./scripts/test.sh all $* 2>&1 | tee /code/test-all.log)
	$(call log_success,All contract tests completed)

.PHONY: test-all-contract-%
test-all-contract-%: build-docker-contracts ensure-scripts-executable
	$(call log_start,Running All Tests for Contract $*)
	$(call log_progress,Running unit and integration tests)
	@$(call docker_run_contracts_network,./scripts/test.sh all $*) || exit 0
	$(call log_success,All tests completed for contract $*)

.PHONY: test-unit-contract-%
test-unit-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Running Unit Tests for Contract $*)
	@$(call log_progress,Executing unit test suite)
	@$(call docker_run_contracts,./scripts/test.sh unit $*) || exit 0
	@$(call log_success,Unit tests for contract $* completed)

.PHONY: test-integration-contract-%
test-integration-contract-%: build-docker-contracts ensure-scripts-executable start-sandbox
	$(call log_start,Running Integration Tests for Contract $*)
	$(call log_progress,Executing integration test suite)
	@$(call docker_run_contracts_network,./scripts/test.sh integration $* $(TEST)) || exit 0
	$(call log_success,Integration tests for contract $* completed)

.PHONY: test-integration-contract-%-no-run
test-integration-contract-%-no-run: build-docker-contracts ensure-scripts-executable
	$(call log_start,Compiling Integration Tests for Contract $* (no-run))
	$(call log_progress,Compiling integration tests without executing)
	@if [ "$*" = "core-onsocial" ]; then \
		$(MAKE) test-integration-contract-core-onsocial-no-run; \
	elif [ "$*" = "cross-contract" ]; then \
		$(MAKE) test-integration-contract-cross-contract-no-run; \
	elif [ "$*" = "staking-onsocial" ]; then \
		$(MAKE) test-integration-contract-staking-onsocial-no-run; \
	else \
		$(call log_error,No -no-run integration compile target defined for contract: $*); \
		exit 1; \
	fi

.PHONY: test-integration-contract-core-onsocial-no-run
test-integration-contract-core-onsocial-no-run: build-docker-contracts ensure-scripts-executable
	$(call docker_run_contracts,set -euo pipefail; \
		cd /code/contracts/core-onsocial; \
		cargo build --release --target wasm32-unknown-unknown; \
		cd /code; \
		cargo test -p onsocial-integration-tests --release --color always --no-run)
	@echo "✅ Integration tests compiled for contract core-onsocial (no-run)"

.PHONY: test-integration-contract-cross-contract-no-run
test-integration-contract-cross-contract-no-run: build-docker-contracts ensure-scripts-executable
	$(call docker_run_contracts,set -euo pipefail; \
		cd /code; \
		cargo test -p onsocial-integration-tests --release --color always --no-run)
	@echo "✅ Integration tests compiled for contract cross-contract (no-run)"

.PHONY: test-integration-contract-staking-onsocial-no-run
test-integration-contract-staking-onsocial-no-run: build-docker-contracts ensure-scripts-executable
	$(call docker_run_contracts,set -euo pipefail; \
		cd /code/contracts/staking-onsocial; \
		cargo build --release --target wasm32-unknown-unknown; \
		cd /code; \
		cargo test -p onsocial-integration-tests --release --color always --no-run)
	@echo "✅ Integration tests compiled for contract staking-onsocial (no-run)"

.PHONY: test-unit-contract-%-test
test-unit-contract-%-test: build-docker-contracts ensure-scripts-executable
	@if [ -z "$(TEST)" ]; then \
		$(call log_error,TEST variable required. Usage: make test-unit-contract-CONTRACTNAME-test TEST=test_name); \
		exit 1; \
	fi
	@$(call log_start,Running Unit Test for Contract $*)
	@$(call log_progress,Executing test: $(TEST))
	@$(call docker_run_contracts,./scripts/test.sh unit $* $(TEST)) || exit 0
	@$(call log_success,Unit test for contract $* completed)

.PHONY: test-integration-contract-%-test
test-integration-contract-%-test: build-docker-contracts ensure-scripts-executable start-sandbox
	@if [ -z "$(TEST)" ]; then \
		$(call log_error,TEST variable required. Usage: make test-integration-contract-CONTRACTNAME-test TEST=test_name); \
		exit 1; \
	fi
	$(call log_start,Running Integration Test for Contract $*)
	$(call log_progress,Executing test: $(TEST))
	@$(call docker_run_contracts_network,./scripts/test.sh integration $* $(TEST)) || exit 0
	$(call log_success,Integration test for contract $* completed)

.PHONY: test-coverage-contract-%
test-coverage-contract-%: build-docker-contracts ensure-scripts-executable
	$(call log_start,Running Tests for Contract $*)
	$(call log_progress,Running test suite)
	$(call docker_run_contracts,./scripts/test_coverage.sh $*)
	$(call log_success,Tests completed for contract $*)

# =============================================================================
# CONTRACT QUALITY TARGETS
# =============================================================================

.PHONY: lint-all-contracts
lint-all-contracts: build-docker-contracts ensure-scripts-executable
	$(call log_start,Linting All Contracts)
	$(call log_progress,Running lint checks on all contracts)
	$(call docker_run_contracts,./scripts/build.sh lint)
	$(call log_success,All contracts linted successfully)

.PHONY: format-all-contracts
format-all-contracts: build-docker-contracts ensure-scripts-executable
	$(call log_start,Formatting All Contracts)
	$(call log_progress,Applying code formatting to all contracts)
	$(call docker_run_contracts,./scripts/build.sh format)
	$(call log_success,All contracts formatted successfully)

.PHONY: format-contract-%
format-contract-%: build-docker-contracts ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		$(call log_error,Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)); \
		exit 1; \
	fi
	$(call log_start,Formatting Contract $*)
	$(call log_progress,Applying code formatting to contract $*)
	$(call docker_run_contracts,./scripts/build.sh format-contract $*)
	$(call log_success,Contract $* formatted successfully)

.PHONY: lint-contract-%
lint-contract-%: build-docker-contracts ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		$(call log_error,Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)); \
		exit 1; \
	fi
	$(call log_start,Linting Contract $*)
	$(call log_progress,Running lint checks on contract $*)
	$(call docker_run_contracts,./scripts/build.sh lint-contract $*)
	$(call log_success,Contract $* linted successfully)

.PHONY: check-contract-%
check-contract-%: build-docker-contracts ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		echo "$(ERROR)Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)$(RESET)"; \
		exit 1; \
	fi
	$(call log_start,Checking Contract $*)
	$(call log_progress,Running cargo check)
	$(call docker_run_contracts,./scripts/build.sh check-contract $*)
	$(call log_success,Contract $* check completed)

.PHONY: clippy-contract-%
clippy-contract-%: build-docker-contracts ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		$(call log_error,Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)); \
		exit 1; \
	fi
	$(call log_start,Running Clippy for Contract $*)
	$(call log_progress,Analyzing code with clippy)
	@docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -e FORCE_COLOR=1 -e TERM=xterm-256color -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
		bash -c "cd contracts/$* && cargo clippy --all-targets --all-features -- -D warnings"
	$(call log_success,Clippy analysis for contract $* completed)

# =============================================================================
# CONTRACT REBUILD TARGETS
# =============================================================================

.PHONY: rebuild-contract-%
rebuild-contract-%: rebuild-docker-contracts
	@if echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		echo "$(ROCKET) Starting: Rebuilding Contract $*..."; \
		echo "$(BUILD) Cleaning contract cache..."; \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -e FORCE_COLOR=1 -e TERM=xterm-256color -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "cd contracts/$* && cargo clean"; \
		echo "$(BUILD) Rebuilding contract..."; \
		$(call docker_run_contracts,cd contracts/$* && cargo build --target wasm32-unknown-unknown --release); \
		echo "$(SUCCESS)Contract $* rebuilt successfully$(RESET)"; \
	else \
		echo "$(ERROR)Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)$(RESET)"; \
		exit 1; \
	fi

.PHONY: rebuild-all-contracts
rebuild-all-contracts: rebuild-docker-contracts
	@echo "$(ROCKET) Starting: Rebuilding All Contracts..."
	@for contract in $(VALID_CONTRACTS); do \
		echo "$(BUILD) Rebuilding contract $$contract..."; \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -e FORCE_COLOR=1 -e TERM=xterm-256color -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "cd contracts/$$contract && cargo clean && cargo build --target wasm32-unknown-unknown --release" || exit 1; \
	done
	@echo "$(SUCCESS)All contracts rebuilt successfully$(RESET)"

# =============================================================================
# CONTRACT DEPLOYMENT TARGETS
# =============================================================================

.PHONY: deploy-contract-%
deploy-contract-%: build-docker-contracts ensure-scripts-executable
	$(call deploy_contract_unified,Deploying,$*,Contract $* deployed successfully)

.PHONY: init-contract-%
init-contract-%: build-docker-contracts ensure-scripts-executable
	$(call init_contract_only,$*)

.PHONY: verify-contract-%
verify-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Verifying Contract $*)
	@$(call log_progress,Running contract verification)
	@docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code --network host -e FORCE_COLOR=1 -e TERM=xterm-256color -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) bash -c "./scripts/build.sh verify $*"
	@$(call log_success,Contract $* verified successfully)

# =============================================================================
# DEPLOYMENT HELPER FUNCTIONS
# =============================================================================

# Unified deployment function for contracts
# Note: Cannot nest $(call ...) inside shell if/else - each expands to separate recipe lines
define deploy_contract_unified
	$(call log_start,$(1) $(2))
	$(call log_info,Deploying contract $(2) to $(NETWORK))
	@CONTRACT_NAME=$(2) docker run --rm $(DOCKER_TTY) \
		-v $(CODE_DIR):/code \
		-v $(HOME)/.near-credentials:/root/.near-credentials:ro \
		--tmpfs /tmp:exec,size=2G \
		--network host \
		-e FORCE_COLOR=1 \
		-e CARGO_TERM_COLOR=always \
		-e TERM=xterm-256color \
		-e NETWORK=$(NETWORK) \
		-e AUTH_ACCOUNT=$(AUTH_ACCOUNT) \
		-e FT_ACCOUNT=$(FT_ACCOUNT) \
		-e RELAYER_ACCOUNT=$(RELAYER_ACCOUNT) \
		-e NEAR_NODE_URL=$(NEAR_NODE_URL) \
		-e CONTRACT_NAME=$(2) \
		-e INIT=$(INIT) \
		-e REPRODUCIBLE=$(REPRODUCIBLE) \
		-e DRY_RUN=$(DRY_RUN) \
		-e VERBOSE=$(VERBOSE) \
		$(CONTRACTS_DOCKER_IMAGE) \
		bash -c "./scripts/deploy.sh"
	$(call log_complete,$(3))
endef

# Contract initialization function
define init_contract_only
	$(call log_start,Initializing contract $(1))
	@if [ -n "$(KEY_FILE)" ] && [ -f "$(KEY_FILE)" ]; then \
		$(call log_info,Using key file: $(KEY_FILE)); \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -v $(KEY_FILE):/tmp/private_key.json --network host \
			-e NETWORK=$(NETWORK) -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "./scripts/deploy.sh init --contract $(1) --use-key-file"; \
	elif [ -f "$(KEYS_DIR)/deployer.$(NETWORK).json" ]; then \
		$(call log_info,Using auto-detected key for $(NETWORK)); \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -v $(KEYS_DIR)/deployer.$(NETWORK).json:/tmp/private_key.json --network host \
			-e NETWORK=$(NETWORK) -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "./scripts/deploy.sh init --contract $(1) --use-key-file"; \
	else \
		$(call log_warning,No key file found - using NEAR CLI credentials); \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code --network host \
			-e NETWORK=$(NETWORK) -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "./scripts/deploy.sh init --contract $(1)"; \
	fi
	$(call log_complete,Contract $(1) initialized)
endef

# =============================================================================
# RUST DEPENDENCY MANAGEMENT
# =============================================================================

.PHONY: upgrade-deps-rs
upgrade-deps-rs: ensure-scripts-executable
	@$(call log_start,Upgrading Rust dependencies)
	@VERBOSE="$(VERBOSE)" ./scripts/upgrade_deps.sh
	@$(call log_success,Rust dependency upgrade completed)

.PHONY: upgrade-deps-rs-incompatible
upgrade-deps-rs-incompatible: ensure-scripts-executable
	@$(call log_start,Upgrading Rust dependencies including incompatible versions)
	@VERBOSE="$(VERBOSE)" INCOMPATIBLE=1 ./scripts/upgrade_deps.sh
	@$(call log_success,Rust dependency upgrade with incompatible versions completed)

# Per-contract dependency version check (read-only, shows available updates)
.PHONY: check-deps-contract-%
check-deps-contract-%: ensure-scripts-executable
	@if ! echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		echo "❌ Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)"; \
		exit 1; \
	fi
	@./scripts/check_contract_deps.sh $*

# =============================================================================
