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
	@$(call log_start,Building All Contracts)
	@$(call log_progress,Building all contracts with optimized WASM)
	@$(call docker_run_contracts,./scripts/build.sh)
	@$(call log_success,All contracts built successfully)

.PHONY: build-contract-%
build-contract-%: build-docker-contracts ensure-scripts-executable
	@if echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		@$(call log_start,Building Contract $*); \
		@$(call docker_run_contracts,./scripts/build.sh build-contract $*); \
		@$(call log_success,Contract $* built successfully); \
	else \
		@$(call log_error,Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)); \
		exit 1; \
	fi

# =============================================================================
# CONTRACT TESTING TARGETS
# =============================================================================

.PHONY: test-all-contracts
test-all-contracts: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Running All Contract Tests)
	@$(call log_progress,Running comprehensive test suite)
	@$(call docker_run_contracts_network,set -o pipefail; ./scripts/test.sh all $* 2>&1 | tee /code/test-all.log)
	@$(call log_success,All contract tests completed)

.PHONY: test-unit-contract-%
test-unit-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Running Unit Tests for Contract $*)
	@$(call log_progress,Executing unit test suite)
	@$(call docker_run_contracts,./scripts/test.sh unit $*)
	@$(call log_success,Unit tests for contract $* completed)

.PHONY: test-integration-contract-%
test-integration-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Running Integration Tests for Contract $*)
	@$(call log_progress,Executing integration test suite)
	@$(call docker_run_contracts_network,./scripts/test.sh integration $*)
	@$(call log_success,Integration tests for contract $* completed)

.PHONY: test-coverage-contract-%
test-coverage-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Generating Test Coverage for Contract $*)
	@$(call log_progress,Running coverage analysis)
	@$(call docker_run_contracts,./scripts/test_coverage.sh $*)
	@$(call log_success,Test coverage report generated for contract $*)

# =============================================================================
# CONTRACT QUALITY TARGETS
# =============================================================================

.PHONY: lint-all-contracts
lint-all-contracts: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Linting All Contracts)
	@$(call log_progress,Running lint checks on all contracts)
	@$(call docker_run_contracts,./scripts/build.sh lint)
	@$(call log_success,All contracts linted successfully)

.PHONY: format-all-contracts
format-all-contracts: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Formatting All Contracts)
	@$(call log_progress,Applying code formatting to all contracts)
	@$(call docker_run_contracts,./scripts/build.sh format)
	@$(call log_success,All contracts formatted successfully)

.PHONY: check-contract-%
check-contract-%: build-docker-contracts ensure-scripts-executable
	@$(call log_start,Checking Contract $*)
	@$(call log_progress,Running cargo check)
	@$(call docker_run_contracts,./scripts/build.sh check-contract $*)
	@$(call log_success,Contract $* check completed)

.PHONY: clippy-contract-%
clippy-contract-%: build-docker-contracts ensure-scripts-executable
	@if echo "$(VALID_CONTRACTS)" | grep -wq "$*"; then \
		@$(call log_start,Running Clippy for Contract $*); \
		@$(call log_progress,Analyzing code with clippy); \
		docker run --rm $(DOCKER_TTY) -v $(CODE_DIR):/code -e FORCE_COLOR=1 -e TERM=xterm-256color -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "cd contracts/$* && cargo clippy --all-targets --all-features -- -D warnings"; \
		@$(call log_success,Clippy analysis for contract $* completed); \
	else \
		@$(call log_error,Unknown contract: $*. Valid contracts: $(VALID_CONTRACTS)); \
		exit 1; \
	fi

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
	@if [ "$(INIT)" = "1" ]; then \
		$(call deploy_contract_unified,Deploying and initializing,$*,Contract $* deployed and initialized successfully); \
	elif [ "$(REPRODUCIBLE)" = "1" ]; then \
		$(call deploy_contract_unified,Deploying $* with reproducible WASM,$*,Contract $* deployed with reproducible WASM successfully); \
	elif [ "$(DRY_RUN)" = "1" ]; then \
		$(call deploy_contract_unified,Simulating deployment of,$*,Dry-run deployment simulation for $* completed successfully); \
	else \
		$(call deploy_contract_unified,Deploying,$*,Contract $* deployed successfully); \
	fi

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
define deploy_contract_unified
	$(call log_start,$(1) $(2))
	@if [ -n "$(KEY_FILE)" ] && [ -f "$(KEY_FILE)" ]; then \
		$(call log_info,Using deployment key file: $(KEY_FILE)); \
		CONTRACT_NAME=$(2) $(call docker_run_contracts_network,./scripts/deploy.sh,/tmp/private_key.json,$(KEY_FILE)); \
	elif [ -f "$(KEYS_DIR)/deployer.$(NETWORK).json" ]; then \
		$(call log_info,Using auto-detected deployment key for $(NETWORK)); \
		CONTRACT_NAME=$(2) $(call docker_run_contracts_network,./scripts/deploy.sh,/tmp/private_key.json,$(KEYS_DIR)/deployer.$(NETWORK).json); \
	else \
		$(call log_warning,No key file found - using NEAR CLI credentials); \
		CONTRACT_NAME=$(2) $(call docker_run_contracts_network,./scripts/deploy.sh); \
	fi
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
