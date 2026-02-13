# =============================================================================
# OnSocial Protocol - Main Makefile
# =============================================================================
# Simplified main entry point for the OnSocial Protocol build system
# For detailed target documentation, see: Resources/MAKE_TARGETS.md

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
# PRODUCTION DEPLOYMENT
# =============================================================================

.PHONY: generate-env-testnet
generate-env-testnet:
	@$(call log_start,Generating testnet production env)
	@scripts/generate-env.sh testnet
	@$(call log_complete,Testnet env generated)

.PHONY: generate-env-mainnet
generate-env-mainnet:
	@$(call log_start,Generating mainnet production env)
	@scripts/generate-env.sh mainnet
	@$(call log_complete,Mainnet env generated)

.PHONY: deploy-testnet
deploy-testnet: generate-env-testnet
	@$(call log_start,Deploying to testnet)
	@test -n "$(SERVER_IP)" || { echo "$(ERROR)SERVER_IP required: make deploy-testnet SERVER_IP=1.2.3.4$(RESET)"; exit 1; }
	@deployment/deploy-production.sh $(SERVER_IP) $(if $(BUILD),--build,)
	@$(call log_complete,Testnet deployment complete)

.PHONY: deploy-mainnet
deploy-mainnet: generate-env-mainnet
	@$(call log_start,Deploying to mainnet)
	@test -n "$(SERVER_IP)" || { echo "$(ERROR)SERVER_IP required: make deploy-mainnet SERVER_IP=1.2.3.4$(RESET)"; exit 1; }
	@echo "$(WARNING)MAINNET deployment — are you sure? Press Ctrl+C to abort, Enter to continue$(RESET)"
	@read -r _
	@deployment/deploy-production.sh $(SERVER_IP) $(if $(BUILD),--build,)
	@$(call log_complete,Mainnet deployment complete)

.PHONY: setup-kms-mainnet
setup-kms-mainnet:
	@$(call log_start,Setting up GCP KMS for mainnet)
	@scripts/setup-kms-mainnet.sh
	@$(call log_complete,KMS mainnet setup complete)

.PHONY: setup-kms-mainnet-dry-run
setup-kms-mainnet-dry-run:
	@scripts/setup-kms-mainnet.sh --dry-run

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
	@echo "  build-contract-<name>         # Build specific contract (e.g., build-contract-core-onsocial)"
	@echo "  test-all-contracts            # Run all contract tests"
	@echo "  test-all-contract-<name>      # Run unit + integration tests for contract"
	@echo "  test-unit-contract-<name>     # Run unit tests for contract"
	@echo "  test-integration-contract-<name> # Run integration tests for contract"
	@echo "  test-unit-contract-<name>-test TEST=<test_name>        # Run single unit test"
	@echo "  test-integration-contract-<name>-test TEST=<test_name> # Run single integration test"
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
	@echo "  status                        # Check system status"
	@echo "  clean-all                     # Clean everything"
	@echo "  cache-clean                   # Clean caches"
	@echo "  start-redis                   # Start Redis for development"
	@echo "  upgrade-deps-rs               # Interactively upgrade Rust dependencies"
	@echo "  upgrade-deps-rs-incompatible  # Upgrade Rust deps including incompatible versions"
	@echo "  upgrade-deps-js               # Interactively upgrade JavaScript dependencies"
	@echo "  cargo-update                  # Simple cargo update (refresh Cargo.lock)"
	@echo ""
	@echo "$(ROCKET) **Production Deployment:**"
	@echo "  generate-env-testnet          # Generate .env.production for testnet"
	@echo "  generate-env-mainnet          # Generate .env.production for mainnet"
	@echo "  deploy-testnet SERVER_IP=x    # Deploy full stack to testnet"
	@echo "  deploy-mainnet SERVER_IP=x    # Deploy full stack to mainnet (with confirmation)"
	@echo "  setup-kms-mainnet             # Create GCP KMS keyrings for mainnet"
	@echo "  setup-kms-mainnet-dry-run     # Preview KMS setup without changes"
	@echo ""
	@echo "$(INFO) **For detailed documentation:** Resources/MAKE_TARGETS.md$(RESET)"
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
	@echo "$(TOOLS) **Deployment Credentials:**"
	@echo "  Uses ~/.near-credentials/ (standard NEAR CLI store)"
	@echo "  Login: near login --networkId testnet"
	@echo ""
	@echo "$(INFO) **Documentation:** See Resources/MAKE_TARGETS.md for complete reference$(RESET)"

# Include target count for reference
.PHONY: targets-count
targets-count:
	@echo "$(INFO)Available make targets: $$(make -qp | grep '^[a-zA-Z0-9][^$$#\/\\t=]*:' | wc -l)$(RESET)"
