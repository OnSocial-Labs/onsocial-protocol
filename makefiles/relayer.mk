# =============================================================================
# RELAYER PACKAGE TARGETS
# =============================================================================
# OnSocial Protocol - Relayer Package Management (Rust)
# Consolidated relayer build, test, lint, format, and deployment operations

# =============================================================================
# RELAYER BUILD TARGETS
# =============================================================================

.PHONY: build-relayer
build-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Building Relayer Package)
	$(call log_progress,Building relayer binary)
	@$(call docker_run_relayer,cargo build --release)
	$(call log_success,Relayer package built successfully)

.PHONY: build-relayer-dev
build-relayer-dev: build-docker-relayer ensure-scripts-executable
	$(call log_start,Building Relayer Package (Dev))
	$(call log_progress,Building relayer in development mode)
	@$(call docker_run_relayer,cargo build)
	$(call log_success,Relayer package built successfully (dev mode))

# =============================================================================
# RELAYER TESTING TARGETS
# =============================================================================

.PHONY: test-relayer
test-relayer: start-redis
	$(call log_start,Testing Relayer Package)
	@if ! nc -z localhost 6379; then \
		echo "$(ERROR)Error: Redis is not running on localhost:6379.$(RESET)"; \
		echo "$(WARNING)Please start Redis first by running:$(RESET)"; \
		echo "$(WARNING)   make start-redis$(RESET)"; \
		exit 1; \
	fi
	$(call log_progress,Running relayer tests with Redis)
	@$(call docker_run_relayer_network,cargo test --release -- --nocapture)
	$(call log_success,Relayer tests completed)

.PHONY: test-relayer-unit
test-relayer-unit: build-docker-relayer ensure-scripts-executable
	$(call log_start,Running Relayer Unit Tests)
	$(call log_progress,Running unit tests (no Redis required))
	@$(call docker_run_relayer,cargo test --lib --release -- --nocapture)
	$(call log_success,Relayer unit tests completed)

.PHONY: test-relayer-integration
test-relayer-integration: start-redis
	$(call log_start,Running Relayer Integration Tests)
	@if ! nc -z localhost 6379; then \
		echo "$(ERROR)Error: Redis is not running on localhost:6379.$(RESET)"; \
		echo "$(WARNING)Please start Redis first:$(RESET)"; \
		echo "$(WARNING)   make start-redis$(RESET)"; \
		exit 1; \
	fi
	$(call log_progress,Running integration tests with Redis)
	@$(call docker_run_relayer_network,cargo test --test '*' --release -- --nocapture)
	$(call log_success,Relayer integration tests completed)

# =============================================================================
# RELAYER CODE QUALITY TARGETS
# =============================================================================

.PHONY: lint-relayer
lint-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Linting Relayer Package)
	$(call log_progress,Running clippy analysis)
	@$(call docker_run_relayer,cargo clippy --all-targets --all-features -- -D warnings)
	$(call log_success,Relayer linting completed)

.PHONY: format-relayer
format-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Formatting Relayer Package)
	$(call log_progress,Applying rustfmt formatting)
	@$(call docker_run_relayer,cargo fmt)
	$(call log_success,Relayer formatting completed)

.PHONY: check-relayer
check-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Checking Relayer Package)
	$(call log_progress,Running cargo check)
	@$(call docker_run_relayer,cargo check --all-targets --all-features)
	$(call log_success,Relayer check completed)

.PHONY: audit-relayer
audit-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Auditing Relayer Dependencies)
	$(call log_progress,Running security audit)
	@$(call docker_run_relayer,cargo audit)
	$(call log_success,Relayer audit completed)

# =============================================================================
# RELAYER UTILITY TARGETS
# =============================================================================

.PHONY: clean-relayer
clean-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Cleaning Relayer Package)
	$(call log_progress,Cleaning relayer build artifacts)
	@$(call docker_run_relayer,cargo clean)
	$(call log_success,Relayer package cleaned successfully)

.PHONY: rebuild-relayer
rebuild-relayer: rebuild-docker-relayer
	$(call log_start,Rebuilding Relayer Package)
	$(call log_progress,Cleaning relayer build artifacts)
	@$(call docker_run_relayer,cargo clean)
	$(call log_progress,Rebuilding relayer binary)
	@$(call docker_run_relayer,cargo build --release)
	$(call log_success,Relayer package rebuilt successfully)

.PHONY: update-relayer-deps
update-relayer-deps: build-docker-relayer ensure-scripts-executable
	$(call log_start,Updating Relayer Dependencies)
	$(call log_progress,Updating Cargo dependencies)
	@$(call docker_run_relayer,cargo update)
	$(call log_success,Relayer dependencies updated)

.PHONY: doc-relayer
doc-relayer: build-docker-relayer ensure-scripts-executable
	$(call log_start,Generating Relayer Documentation)
	$(call log_progress,Building rustdoc documentation)
	@$(call docker_run_relayer,cargo doc --no-deps --open)
	$(call log_success,Relayer documentation generated)

# =============================================================================
# RELAYER KEY MANAGEMENT
# =============================================================================

.PHONY: setup-relayer-keys
setup-relayer-keys: build-docker-relayer ensure-scripts-executable
	$(call log_start,Setting Up Relayer Keys)
	$(call log_progress,Running multikey setup script)
	@$(call docker_run_relayer,./multikey_setup.sh)
	$(call log_success,Relayer keys setup completed)

.PHONY: keys-relayer
keys-relayer: setup-relayer-keys

# =============================================================================
# RELAYER DEVELOPMENT TARGETS
# =============================================================================

.PHONY: run-relayer
run-relayer: build-relayer start-redis
	$(call log_start,Starting Relayer Service)
	@if ! nc -z localhost 6379; then \
		echo "$(ERROR)Error: Redis is not running on localhost:6379.$(RESET)"; \
		echo "$(WARNING)Please start Redis first:$(RESET)"; \
		echo "$(WARNING)   make start-redis$(RESET)"; \
		exit 1; \
	fi
	$(call log_progress,Starting relayer with Redis backend)
	@$(call docker_run_relayer_network,cargo run --release)

.PHONY: run-relayer-dev
run-relayer-dev: build-relayer-dev start-redis
	$(call log_start,Starting Relayer Service (Dev Mode))
	@if ! nc -z localhost 6379; then \
		echo "$(ERROR)Error: Redis is not running on localhost:6379.$(RESET)"; \
		echo "$(WARNING)Please start Redis first:$(RESET)"; \
		echo "$(WARNING)   make start-redis$(RESET)"; \
		exit 1; \
	fi
	$(call log_progress,Starting relayer in development mode)
	@$(call docker_run_relayer_network,cargo run)

.PHONY: watch-relayer
watch-relayer: build-docker-relayer start-redis
	$(call log_start,Starting Relayer Watch Mode)
	$(call log_progress,Starting cargo watch for auto-rebuild)
	@$(call docker_run_relayer_network,cargo install cargo-watch && cargo watch -x 'run')

# =============================================================================
# RELAYER COMPREHENSIVE TARGETS
# =============================================================================

.PHONY: relayer-full-check
relayer-full-check: check-relayer lint-relayer test-relayer-unit audit-relayer
	$(call log_complete,Relayer full check)

.PHONY: relayer-ci
relayer-ci: format-relayer lint-relayer test-relayer-unit
	$(call log_complete,Relayer CI pipeline)

.PHONY: relayer-dev-setup
relayer-dev-setup: build-docker-relayer setup-relayer-keys start-redis
	$(call log_complete,Relayer development environment ready)
