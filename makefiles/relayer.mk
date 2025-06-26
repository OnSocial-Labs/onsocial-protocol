# =============================================================================
# RELAYER PACKAGE TARGETS
# =============================================================================
# OnSocial Protocol - Essential Relayer Development Operations
# Integrates with docker.mk for consistent containerized development

# =============================================================================
# CORE DEVELOPMENT TARGETS
# =============================================================================

.PHONY: build-relayer
build-relayer: build-docker-relayer
	@$(call log_start,Building Relayer Package)
	@$(call log_progress,Building relayer binary)
	@$(call docker_run_relayer,cargo build --release)
	@$(call log_success,Relayer package built successfully)

.PHONY: build-docker-relayer-production
build-docker-relayer-production:
	@$(call log_start,Building Production Relayer Docker Image)
	@$(call log_progress,Building optimized production relayer image)
	@docker build -f docker/Dockerfile.relayer --target production -t $(RS_PRODUCTION_IMAGE) .
	@$(call log_success,Production relayer Docker image built successfully)

.PHONY: test-relayer-unit
test-relayer-unit: build-docker-relayer
	@$(call log_start,Running Relayer Unit Tests)
	@$(call log_progress,Running unit tests without Redis)
	@$(call docker_run_relayer,cargo test --lib)
	@$(call log_success,Relayer unit tests completed)

.PHONY: test-relayer
test-relayer: build-docker-relayer start-redis
	@$(call log_start,Testing Relayer Package with Redis)
	@$(call log_progress,Running integration tests)
	@$(call docker_run_relayer_network,cargo test --release)
	@$(call log_success,Relayer integration tests completed)
	@$(MAKE) stop-redis

.PHONY: lint-relayer
lint-relayer: build-docker-relayer
	@$(call log_start,Linting Relayer Package)
	@$(call log_progress,Running clippy analysis)
	@$(call docker_run_relayer,cargo clippy --all-targets --all-features -- -D warnings)
	@$(call log_progress,Running cargo check)
	@$(call docker_run_relayer,cargo check --all-targets --all-features)
	@$(call log_success,Relayer linting completed)

.PHONY: format-relayer
format-relayer: build-docker-relayer
	@$(call log_start,Formatting Relayer Package)
	@$(call log_progress,Applying rustfmt formatting)
	@$(call docker_run_relayer,cargo fmt)
	@$(call log_success,Relayer formatting completed)

.PHONY: clean-relayer
clean-relayer: build-docker-relayer
	@$(call log_start,Cleaning Relayer Package)
	@$(call log_progress,Cleaning relayer build artifacts)
	@$(call docker_run_relayer,cargo clean)
	@$(call log_success,Relayer package cleaned)

# =============================================================================
# RELAYER SERVICE MANAGEMENT
# =============================================================================

.PHONY: docker-run-relayer
docker-run-relayer: build-docker-relayer-production
	@$(call log_start,Starting Relayer Docker Container)
	@$(call log_progress,Stopping any existing relayer services)
	@docker stop relayer 2>/dev/null || true
	@docker rm relayer 2>/dev/null || true
	@docker ps --filter "ancestor=relayer-builder" --format "{{.ID}}" | xargs -r docker stop 2>/dev/null || true
	@$(call log_progress,Checking for existing relayer container)
	@CONTAINER_NAME=relayer; \
	PORT=3040; \
	IMAGE_NAME=$(RS_PRODUCTION_IMAGE); \
	CONFIG_PATH=$(CODE_DIR)/packages/relayer/config.toml; \
	KEYS_PATH=$(CODE_DIR)/packages/relayer/account_keys; \
	if docker ps -a --format "table {{.Names}}" | grep -q "^$$CONTAINER_NAME$$"; then \
		echo "$(BUILD)Removing existing relayer container...$(RESET)"; \
		docker rm -f $$CONTAINER_NAME; \
	fi; \
	echo "$(BUILD)Starting relayer container as daemon on port $$PORT...$(RESET)"; \
	docker run -d --name $$CONTAINER_NAME -p $$PORT:$$PORT -v $$CONFIG_PATH:/relayer-app/config.toml -v $$KEYS_PATH:/relayer-app/account_keys $$IMAGE_NAME
	@echo "$(INFO) Relayer container is running at http://localhost:3040$(RESET)"
	@$(call log_success,Relayer Docker container started successfully)

.PHONY: docker-stop-relayer
docker-stop-relayer:
	@$(call log_start,Stopping Relayer Docker Container)
	@$(call log_progress,Stopping relayer container)
	@docker stop relayer || true
	@$(call log_progress,Removing relayer container)
	@docker rm relayer || true
	@$(call log_success,Relayer Docker container stopped and removed)

.PHONY: logs-relayer
logs-relayer:
	@$(call log_start,Showing Relayer Docker Container Logs)
	@echo "$(INFO) Press Ctrl+C to stop viewing logs$(RESET)"
	@docker logs relayer -f

.PHONY: run-relayer
run-relayer: build-docker-relayer start-redis
	@$(call log_start,Starting Relayer Service)
	@$(call log_progress,Stopping any existing relayer containers)
	@docker stop relayer 2>/dev/null || true
	@docker rm relayer 2>/dev/null || true
	@docker ps --filter "ancestor=relayer-builder" --format "{{.ID}}" | xargs -r docker stop 2>/dev/null || true
	@$(call log_progress,Starting relayer on port 3040)
	@echo "$(INFO) Relayer will be available at http://localhost:3040$(RESET)"
	@echo "$(INFO) Press Ctrl+C to stop the relayer$(RESET)"
	@$(call docker_run_relayer_network,cargo run --release)

.PHONY: stop-relayer
stop-relayer:
	@$(call log_start,Stopping Relayer Service)
	@$(call log_progress,Stopping any relayer Docker containers)
	@docker ps --filter "ancestor=relayer-builder" --format "{{.ID}}" | xargs -r docker stop 2>/dev/null || true
	@$(call log_progress,Finding and stopping host processes on port 3040)
	@if lsof -ti:3040 >/dev/null 2>&1; then \
		echo "Stopping relayer process on port 3040..."; \
		kill -TERM $$(lsof -ti:3040) 2>/dev/null || true; \
		sleep 2; \
		if lsof -ti:3040 >/dev/null 2>&1; then \
			echo "Force killing relayer process..."; \
			kill -KILL $$(lsof -ti:3040) 2>/dev/null || true; \
		fi; \
	else \
		echo "No host process found running on port 3040"; \
	fi
	@$(call log_success,Relayer service stopped)

.PHONY: stop-relayer-all
stop-relayer-all:
	@$(call log_start,Stopping All Relayer Services)
	@$(call log_progress,Stopping Docker container on port 3040)
	@docker stop relayer 2>/dev/null || echo "No Docker container running"
	@docker rm relayer 2>/dev/null || echo "No Docker container to remove"
	@$(call log_progress,Stopping processes on port 3041)
	@if lsof -ti:3041 >/dev/null 2>&1; then \
		echo "Stopping relayer process on port 3041..."; \
		kill -TERM $$(lsof -ti:3041) 2>/dev/null || true; \
		sleep 2; \
		if lsof -ti:3041 >/dev/null 2>&1; then \
			echo "Force killing relayer process on port 3041..."; \
			kill -KILL $$(lsof -ti:3041) 2>/dev/null || true; \
		fi; \
	else \
		echo "No process found running on port 3041"; \
	fi
	@$(call log_progress,Stopping processes on port 3040)
	@if lsof -ti:3040 >/dev/null 2>&1; then \
		echo "Stopping any remaining process on port 3040..."; \
		kill -TERM $$(lsof -ti:3040) 2>/dev/null || true; \
		sleep 2; \
		if lsof -ti:3040 >/dev/null 2>&1; then \
			echo "Force killing process on port 3040..."; \
			kill -KILL $$(lsof -ti:3040) 2>/dev/null || true; \
		fi; \
	else \
		echo "No process found running on port 3040"; \
	fi
	@$(call log_success,All relayer services stopped)

# =============================================================================
# RELAYER SETUP & UTILITIES
# =============================================================================

.PHONY: keys-relayer
keys-relayer:
	@$(call log_start,Setting Up Relayer Keys)
	@$(call log_progress,Running multikey setup script)
	@bash packages/relayer/multikey_setup.sh
	@$(call log_success,Relayer keys setup completed)
