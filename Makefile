# =============================================================================
# OnSocial Protocol - Main Makefile
# =============================================================================
# Simplified main entry point for the OnSocial Protocol build system
# For detailed target documentation, see: docs/MAKE_TARGETS.md

.DEFAULT_GOAL := help

# =============================================================================
# INCLUDE MODULAR MAKEFILES
# =============================================================================

include makefiles/variables.mk
include makefiles/docker.mk
include makefiles/contracts.mk
include makefiles/javascript.mk
include makefiles/relayer.mk
include makefiles/utilities.mk

# =============================================================================
# HIGH-LEVEL CONVENIENCE TARGETS
# =============================================================================

.PHONY: all
all: build-all-contracts test-all-contracts
	$(call log_complete,Complete build and test cycle finished)

.PHONY: setup
setup: build-docker-contracts build-docker-nodejs
	$(call log_complete,Initial project setup completed)

.PHONY: dev
dev: setup build-all-contracts build-all-js
	$(call log_complete,Development environment ready)

.PHONY: test
test: test-all-contracts test-all-js test-relayer-unit
	$(call log_complete,All tests completed)

.PHONY: build
build: build-all-contracts build-all-js build-relayer
	$(call log_complete,All packages built)

.PHONY: lint
lint: lint-all-contracts lint-all-js lint-relayer
	$(call log_complete,All linting completed)

# =============================================================================
# DEPLOYMENT KEY MANAGEMENT
# =============================================================================

.PHONY: setup-deployment-keys
setup-deployment-keys:
	@$(call log_start,Setting Up Deployment Keys)
	@$(call log_info,This will help you create secure deployment keys)
	@echo ""
	@echo "$(WARNING)IMPORTANT: Deployment keys should be kept secure and never committed to git$(RESET)"
	@echo ""
	@mkdir -p $(KEYS_DIR)
	@echo "$(INFO)Created keys directory: $(KEYS_DIR)$(RESET)"
	@echo ""
	@echo "$(INFO)To create a deployment key:$(RESET)"
	@echo "1. Generate a new NEAR account key pair"
	@echo "2. Save it as: $(KEYS_DIR)/deployer.NETWORK.json"
	@echo "3. Format: {\"account_id\": \"your.account\", \"public_key\": \"ed25519:...\", \"private_key\": \"ed25519:...\"}"
	@echo ""
	@echo "$(INFO)Example key files:$(RESET)"
	@echo "  $(KEYS_DIR)/deployer.testnet.json"
	@echo "  $(KEYS_DIR)/deployer.mainnet.json"
	@echo ""
	@echo "$(SUCCESS)Deployment keys directory ready$(RESET)"

.PHONY: list-deployment-keys
list-deployment-keys:
	@$(call log_start,Available Deployment Keys)
	@echo "$(INFO)Deployment keys directory: $(KEYS_DIR)$(RESET)"
	@if [ -d "$(KEYS_DIR)" ]; then \
		@echo "$(INFO)Found key files:$(RESET)"; \
		for key in $(KEYS_DIR)/*.json; do \
			if [ -f "$$key" ]; then \
				@echo "  $(SUCCESS)$$(basename $$key)$(RESET)"; \
				if command -v jq >/dev/null 2>&1; then \
					account=$$(jq -r '.account_id' "$$key" 2>/dev/null || echo "invalid format"); \
					@echo "    Account: $$account"; \
				fi; \
			fi; \
		done; \
		if ! ls $(KEYS_DIR)/*.json >/dev/null 2>&1; then \
			@echo "  $(WARNING)No key files found$(RESET)"; \
			@echo "  $(INFO)Run 'make setup-deployment-keys' to get started$(RESET)"; \
		fi; \
	else \
		@echo "$(WARNING)Deployment keys directory not found$(RESET)"; \
	fi

.PHONY: validate-deployment-key
validate-deployment-key:
	@if [ -z "$(KEY_FILE)" ]; then \
		echo "$(ERROR)Please specify KEY_FILE=path/to/key.json$(RESET)"; \
		exit 1; \
	fi
	$(call log_start,Validating Deployment Key)
	$(call log_progress,Checking key file: $(KEY_FILE))
	@if [ ! -f "$(KEY_FILE)" ]; then \
		echo "$(ERROR)Key file not found: $(KEY_FILE)$(RESET)"; \
		exit 1; \
	fi
	@if command -v jq >/dev/null 2>&1; then \
		if jq -e '.account_id and .public_key and .private_key' "$(KEY_FILE)" >/dev/null 2>&1; then \
			account=$$(jq -r '.account_id' "$(KEY_FILE)"); \
			echo "$(SUCCESS)Key file is valid$(RESET)"; \
			echo "$(INFO)Account ID: $$account$(RESET)"; \
		else \
			echo "$(ERROR)Invalid key file format$(RESET)"; \
			echo "$(INFO)Required fields: account_id, public_key, private_key$(RESET)"; \
			exit 1; \
		fi; \
	else \
		echo "$(WARNING)jq not found - unable to validate JSON format$(RESET)"; \
	fi
	$(call log_success,Key validation completed)

# =============================================================================
# HELP SYSTEM
# =============================================================================

.PHONY: help
help:
	@echo "$(ROCKET) OnSocial Protocol Build System"
	@echo "========================================="
	@echo ""
	@echo "$(BUILD) **Quick Start:**"
	@echo "  make status                    # Check system status"
	@echo "  make setup                     # Initial project setup"
	@echo "  make dev                       # Setup development environment"
	@echo "  make build                     # Build all packages"
	@echo "  make test                      # Run all tests"
	@echo ""
	@echo "$(DOCKER) **High-Level Targets:**"
	@echo "  all                           # Build and test everything"
	@echo "  setup                         # Install dependencies and build Docker images"
	@echo "  dev                           # Complete development environment setup"
	@echo "  build                         # Build all contracts and JavaScript packages"
	@echo "  test                          # Run all tests (contracts + JavaScript)"
	@echo "  lint                          # Lint all code (contracts + JavaScript)"
	@echo ""
	@echo "$(PACKAGE) **Contract Operations:**"
	@echo "  build-all-contracts           # Build all smart contracts"
	@echo "  test-all-contracts            # Run all contract tests"
	@echo "  deploy-contract-<name>        # Deploy specific contract"
	@echo ""
	@echo "$(PACKAGE) **JavaScript Operations:**"
	@echo "  build-all-js                  # Build all JavaScript packages"
	@echo "  test-all-js                   # Test all JavaScript packages"
	@echo "  build-onsocial-<package>      # Build specific package"
	@echo ""
	@echo "$(PACKAGE) **Relayer Operations:**"
	@echo "  build-relayer                 # Build relayer package"
	@echo "  test-relayer                  # Test relayer with Redis"
	@echo "  run-relayer                   # Run relayer service"
	@echo "  lint-relayer                  # Lint relayer code"
	@echo ""
	@echo "$(TOOLS) **System Management:**"
	@echo "  status                        # Show system status"
	@echo "  clean-all                     # Clean everything"
	@echo "  cache-clean                   # Clean caches"
	@echo "  start-redis                   # Start Redis for development"
	@echo ""
	@echo "$(INFO) **For detailed documentation:** docs/MAKE_TARGETS.md$(RESET)"
	@echo "$(INFO) **For deployment help:** make setup-deployment-keys$(RESET)"
	@echo ""
	@echo "$(SUCCESS)Use VERBOSE=1 for detailed output$(RESET)"
	@echo "$(SUCCESS)Use -j$(shell nproc) for parallel builds$(RESET)"

.PHONY: help-deployment
help-deployment:
	@echo "$(ROCKET) OnSocial Protocol - Deployment Guide"
	@echo "=============================================="
	@echo ""
	@echo "$(BUILD) **Available Contracts:**"
	@echo "  $(VALID_CONTRACTS)"
	@echo ""
	@echo "$(TOOLS) **Deployment Modes:**"
	@echo "  Standard:      make deploy-contract-<name> NETWORK=testnet"
	@echo "  With Init:     make deploy-contract-<name> NETWORK=testnet INIT=1"
	@echo "  Reproducible:  make deploy-contract-<name> NETWORK=testnet REPRODUCIBLE=1"
	@echo "  Dry Run:       make deploy-contract-<name> NETWORK=testnet DRY_RUN=1"
	@echo ""
	@echo "$(TOOLS) **Key Management:**"
	@echo "  setup-deployment-keys         # Setup secure deployment keys"
	@echo "  list-deployment-keys          # List available keys"
	@echo "  validate-deployment-key       # Validate key file (use KEY_FILE=path)"
	@echo ""
	@echo "$(INFO) **Security:** Always use KEY_FILE for production deployments$(RESET)"
	@echo "$(INFO) **Documentation:** See docs/MAKE_TARGETS.md for complete reference$(RESET)"

# Include target count for reference
.PHONY: targets-count
targets-count:
	@echo "$(INFO)Available make targets: $$(make -qp | grep '^[a-zA-Z0-9][^$$#\/\\t=]*:' | wc -l)$(RESET)"
