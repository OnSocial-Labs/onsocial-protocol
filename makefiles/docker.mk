# =============================================================================
# DOCKER UTILITIES AND FUNCTIONS
# =============================================================================
# OnSocial Protocol - Docker Functions and Utilities
# Note: Color and emoji variables are defined in variables.mk
# Variables are already included via the main Makefile

# Always disable TTY for Docker in all environments to avoid CI errors
DOCKER_TTY := -i

# =============================================================================
# STANDARDIZED LOGGING FUNCTIONS
# =============================================================================

# Log informational messages with consistent formatting
define log_info
	@echo "$(INFO)$(1)$(RESET)"
endef

# Log success messages with consistent formatting
define log_success
	@echo "$(SUCCESS)$(1)$(RESET)"
endef

# Log warning messages with consistent formatting
define log_warning
	@echo "$(WARNING)$(1)$(RESET)"
endef

# Log error messages with consistent formatting
define log_error
	@echo "$(ERROR)$(1)$(RESET)"
endef

# Log operation start with consistent formatting
define log_start
	@echo "$(ROCKET) Starting: $(1)..."
endef

# Log operation progress with consistent formatting
define log_progress
	@echo "$(BUILD) $(1)..."
endef

# Log operation completion with consistent formatting
define log_complete
	@echo "$(SUCCESS)✨ $(1) completed successfully$(RESET)"
endef

# =============================================================================
# REUSABLE DOCKER RUN FUNCTIONS
# =============================================================================

# Standard Docker run for contracts with common flags
define docker_run_contracts
	@if [ "$(VERBOSE)" = "1" ]; then \
		echo "$(INFO)> [contracts] $(1)$(RESET)"; \
	fi
	@docker run --rm $(DOCKER_TTY) \
		-v $(CODE_DIR):/code \
		--tmpfs /tmp:exec,size=2G \
		-e FORCE_COLOR=1 \
		-e CARGO_TERM_COLOR=always \
		-e TERM=xterm-256color \
		-e VERBOSE=$(VERBOSE) \
		$(CONTRACTS_DOCKER_IMAGE) \
		bash -c "$(1)"
endef

# Docker run for contracts with network access
define docker_run_contracts_network
	@if [ "$(VERBOSE)" = "1" ]; then \
		echo "$(INFO)> [contracts:network] $(1)$(RESET)"; \
	fi
	@docker run --rm $(DOCKER_TTY) \
		-v $(CODE_DIR):/code \
		$(if $(2),-v $(3):$(2)) \
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
		-e CONTRACT_NAME=$(CONTRACT_NAME) \
		-e INIT=$(INIT) \
		-e REPRODUCIBLE=$(REPRODUCIBLE) \
		-e DRY_RUN=$(DRY_RUN) \
		-e VERBOSE=$(VERBOSE) \
		$(CONTRACTS_DOCKER_IMAGE) \
		bash -c "$(1)"
endef

# Docker run for relayer packages
define docker_run_relayer
	docker run --rm $(DOCKER_TTY) \
		-v $(CODE_DIR):/code \
		-w /code/packages/onsocial-relayer \
		-e FORCE_COLOR=1 \
		-e TERM=xterm-256color \
		-e VERBOSE=$(VERBOSE) \
		$(RS_DOCKER_IMAGE) \
		$(1)
endef

# Docker run for relayer packages with network access (for Redis)
define docker_run_relayer_network
	docker run --rm $(DOCKER_TTY) \
		--network host \
		-v $(CODE_DIR):/code \
		-w /code/packages/onsocial-relayer \
		-e FORCE_COLOR=1 \
		-e TERM=xterm-256color \
		-e VERBOSE=$(VERBOSE) \
		$(RS_DOCKER_IMAGE) \
		$(1)
endef

# Reusable macro for running JS package commands in Docker
# Usage: $(call docker_run_js_package,onsocial-js,lint)
define docker_run_js_package
	docker run --rm $(DOCKER_TTY) \
		-v $(CODE_DIR):/app \
		-w /app \
		-e PATH="/app/node_modules/.bin:$$PATH" \
		-e FORCE_COLOR=1 \
		-e TERM=xterm-256color \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		-e VERBOSE=$(VERBOSE) \
		$(JS_DOCKER_IMAGE) \
		sh -c "cd /app && \
		if echo '$(2)' | grep -q '^[a-zA-Z][a-zA-Z0-9-]*$$'; then \
			pnpm --filter $(1) run $(2); \
		else \
			echo '> $(1) exec /app/packages/$(1)'; \
			echo '> $(2)'; \
			pnpm --filter $(1) exec -- $(2); \
		fi"
endef

# Reusable macro for running JS package commands in Docker (CI version, no volume mount)
define docker_run_js_package_ci
	docker run --rm $(DOCKER_TTY) \
		-w /app \
		-e PATH="/app/node_modules/.bin:$$PATH" \
		-e FORCE_COLOR=1 \
		-e TERM=xterm-256color \
		-e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
		-e VERBOSE=$(VERBOSE) \
		$(JS_DOCKER_IMAGE) \
		sh -c "cd /app && \
		if echo '$(2)' | grep -q '^[a-zA-Z][a-zA-Z0-9-]*$$'; then \
			pnpm --filter $(1) run $(2); \
		else \
			echo '> $(1) exec /app/packages/$(1)'; \
			echo '> $(2)'; \
			pnpm --filter $(1) exec -- $(2); \
		fi"
endef

# =============================================================================
# DOCKER IMAGE BUILD TARGETS AND CACHING
# =============================================================================

# Docker image cache tracking
CONTRACTS_IMAGE_STAMP := $(DOCKER_CACHE_DIR)/contracts-image.stamp
JS_IMAGE_STAMP := $(DOCKER_CACHE_DIR)/js-image.stamp
RELAYER_IMAGE_STAMP := $(DOCKER_CACHE_DIR)/relayer-image.stamp

# Dependencies for image rebuilds
CONTRACTS_DEPS := docker/Dockerfile.contracts Cargo.toml contracts/*/Cargo.toml
JS_DEPS := docker/Dockerfile.nodejs package.json packages/*/package.json pnpm-lock.yaml
RELAYER_DEPS := docker/Dockerfile.relayer packages/onsocial-relayer/Cargo.toml

# Build Docker images with intelligent caching
$(CONTRACTS_IMAGE_STAMP): $(CONTRACTS_DEPS)
	@$(call log_start,Building Contracts Docker Image)
	@$(call log_progress,Building optimized Rust environment)
	@mkdir -p $(DOCKER_CACHE_DIR)
	@docker build -f docker/Dockerfile.contracts -t $(CONTRACTS_DOCKER_IMAGE) .
	@touch $@
	@$(call log_success,Contracts Docker image built successfully)

$(JS_IMAGE_STAMP): $(JS_DEPS)
	@$(call log_start,Building Dependencies-Only JavaScript Docker Image)
	@$(call log_progress,Building Node.js environment with dependencies only (fast build))
	@mkdir -p $(DOCKER_CACHE_DIR)
	@docker build --target builder -f docker/Dockerfile.nodejs --build-arg BUILD_PACKAGES=skip-build -t $(JS_DOCKER_IMAGE) .
	@touch $@
	@$(call log_success,Dependencies-only JavaScript Docker image built successfully)

$(RELAYER_IMAGE_STAMP): $(RELAYER_DEPS)
	@$(call log_start,Building Relayer Docker Image)
	@$(call log_progress,Building Rust relayer environment)
	@mkdir -p $(DOCKER_CACHE_DIR)
	@docker build -f docker/Dockerfile.relayer -t $(RS_DOCKER_IMAGE) .
	@touch $@
	@$(call log_success,Relayer Docker image built successfully)

# Public Docker build targets
.PHONY: build-docker-contracts
build-docker-contracts: $(CONTRACTS_IMAGE_STAMP)

.PHONY: build-docker-nodejs
build-docker-nodejs: $(JS_IMAGE_STAMP)

.PHONY: build-docker-relayer
build-docker-relayer: $(RELAYER_IMAGE_STAMP)

.PHONY: rebuild-docker-contracts
rebuild-docker-contracts:
	$(call log_start,Rebuilding Contracts Docker Image)
	$(call log_progress,Removing existing image)
	@docker rmi $(CONTRACTS_DOCKER_IMAGE) 2>/dev/null || true
	@rm -f $(CONTRACTS_IMAGE_STAMP)
	@$(MAKE) $(CONTRACTS_IMAGE_STAMP)

.PHONY: rebuild-docker-nodejs
rebuild-docker-nodejs:
	$(call log_start,Rebuilding JavaScript Docker Image)
	$(call log_progress,Removing existing image)
	@docker rmi $(JS_DOCKER_IMAGE) 2>/dev/null || true
	$(call log_progress,Rebuilding image with no cache)
	docker build --target builder --no-cache -f docker/Dockerfile.nodejs --build-arg BUILD_PACKAGES=skip-build -t $(JS_DOCKER_IMAGE) .
	@rm -f $(JS_IMAGE_STAMP)
	$(call log_success,JavaScript Docker image rebuilt successfully)

.PHONY: rebuild-docker-relayer
rebuild-docker-relayer:
	$(call log_start,Rebuilding Relayer Docker Image)
	$(call log_progress,Removing existing image)
	@docker rmi $(RS_DOCKER_IMAGE) 2>/dev/null || true
	@rm -f $(RELAYER_IMAGE_STAMP)
	@$(MAKE) $(RELAYER_IMAGE_STAMP)

.PHONY: rebuild-docker-all
rebuild-docker-all: rebuild-docker-contracts rebuild-docker-nodejs rebuild-docker-relayer
	$(call log_complete,All Docker images rebuilt)

# Dynamic clean for any service's Docker images and containers
.PHONY: clean-docker-%
clean-docker-%:
	@$(call log_start,Docker Cleanup for $*)
	@$(call log_progress,Stopping containers)
	@if docker ps -q --filter "ancestor=$*-builder" | grep -q .; then \
		docker stop $$(docker ps -q --filter "ancestor=$*-builder"); \
		echo "$(SUCCESS)Containers stopped$(RESET)"; \
	else \
		echo "$(INFO)No running containers found$(RESET)"; \
	fi
	@$(call log_progress,Removing containers)
	@if docker ps -aq --filter "ancestor=$*-builder" | grep -q .; then \
		docker rm $$(docker ps -aq --filter "ancestor=$*-builder"); \
		echo "$(SUCCESS)Containers removed$(RESET)"; \
	else \
		echo "$(INFO)No containers to remove$(RESET)"; \
	fi
	@$(call log_progress,Removing base image)
	@if docker images -q "$*-builder" | grep -q .; then \
		docker rmi "$*-builder"; \
		echo "$(SUCCESS)Base image removed$(RESET)"; \
	else \
		echo "$(INFO)No base image to remove$(RESET)"; \
	fi
	@if [ "$*" = "nodejs" ]; then \
		echo "$(BUILD)Cleaning Node.js builder images..."; \
		if docker images -q "$(JS_DOCKER_IMAGE)" | grep -q .; then \
			docker rmi "$(JS_DOCKER_IMAGE)"; \
			echo "$(SUCCESS)Base Node.js builder image removed$(RESET)"; \
		fi; \
		if docker images -q "$(JS_DOCKER_IMAGE)-all" | grep -q .; then \
			docker rmi "$(JS_DOCKER_IMAGE)-all"; \
			echo "$(SUCCESS)All-packages Node.js image removed$(RESET)"; \
		fi; \
	fi
	@$(call log_progress,Pruning unused volumes)
	@docker volume prune -f >/dev/null 2>&1
	@$(call log_success,Docker cleanup for $* completed)

.PHONY: clean-docker-all
clean-docker-all: clean-docker-contracts clean-docker-nodejs clean-docker-relayer
	@$(call log_start,Complete Docker Cleanup)
	@$(call log_progress,Cleaning all OnSocial Docker resources)
	@docker system prune -f >/dev/null 2>&1
	@rm -f $(CONTRACTS_IMAGE_STAMP) $(JS_IMAGE_STAMP) $(RELAYER_IMAGE_STAMP)
	@$(call log_success,All Docker resources cleaned)
