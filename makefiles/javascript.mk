# =============================================================================
# JAVASCRIPT PACKAGE TARGETS
# =============================================================================
# OnSocial Protocol - JavaScript/TypeScript Package Targets
#
# Note: This file should only be included from the main Makefile
# Variables and functions are provided by variables.mk and docker.mk

# =============================================================================
# JAVASCRIPT BUILD TARGETS
# =============================================================================

# =============================================================================
# JAVASCRIPT CLEAN TARGETS
# =============================================================================

.PHONY: clean-install-js
clean-install-js: clean-docker-nodejs rebuild-docker-nodejs ensure-scripts-executable
	$(call log_start,JavaScript Dependencies Reinstall)
	$(call log_progress,Cleaning local build artifacts)
	@rm -rf packages/*/dist
	@find packages -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true
	$(call log_progress,Cleaning and reinstalling JavaScript dependencies)
	@rm -rf node_modules
	@docker volume create pnpm-store
	@docker run -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm install --frozen-lockfile --store-dir=/app/.pnpm-store
	$(call log_success,JavaScript dependencies reinstalled successfully)

.PHONY: upgrade-deps-js
upgrade-deps-js:
	$(call log_start,JavaScript Dependencies Upgrade)
	$(call log_progress,Running JavaScript dependency upgrade)
	@docker volume create pnpm-store || true
	@docker run -v $(CURDIR):/app -v pnpm-store:/app/.pnpm-store --rm --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) sh /app/scripts/upgrade_deps_js.sh
	$(call log_success,JavaScript dependencies upgraded successfully)

# =============================================================================
# JAVASCRIPT PACKAGE-SPECIFIC TARGETS
# =============================================================================

# Use unified Docker image for all packages (leverages Dockerfile.nodejs BUILD_PACKAGES capability)
.PHONY: build-docker-nodejs-%
build-docker-nodejs-%:
	@if ! docker images -q $(JS_DOCKER_IMAGE) | grep -q .; then \
		echo "$(INFO)Building Docker image $(JS_DOCKER_IMAGE) for onsocial-$*...$(RESET)"; \
		docker build -f docker/Dockerfile.nodejs --build-arg BUILD_PACKAGES=onsocial-$* -t $(JS_DOCKER_IMAGE) .; \
		echo "$(SUCCESS)Built $(JS_DOCKER_IMAGE) for onsocial-$*.$(RESET)"; \
	else \
		echo "$(INFO)Using existing $(JS_DOCKER_IMAGE) for onsocial-$*.$(RESET)"; \
	fi

.PHONY: build-onsocial-%
build-onsocial-%: build-docker-nodejs-% ensure-scripts-executable
	$(call log_success,onsocial-$* ready via Docker image)

.PHONY: test-onsocial-%
test-onsocial-%: build-docker-nodejs-% ensure-scripts-executable
	$(call docker_run_js_package,onsocial-$*,test)
	$(call log_success,onsocial-$* tested successfully)

.PHONY: lint-onsocial-%
lint-onsocial-%: build-docker-nodejs-% ensure-scripts-executable
	$(call docker_run_js_package,onsocial-$*,lint)
	$(call log_success,onsocial-$* linted successfully)

.PHONY: format-onsocial-%
format-onsocial-%: build-docker-nodejs-% ensure-scripts-executable
	$(call docker_run_js_package,onsocial-$*,format)
	$(call log_success,onsocial-$* formatted successfully)

.PHONY: check-onsocial-%
check-onsocial-%: build-docker-nodejs-% ensure-scripts-executable
	$(call docker_run_js_package,onsocial-$*,tsc --noEmit)
	$(call log_success,onsocial-$* type-checked successfully)

# =============================================================================
# JAVASCRIPT REBUILD TARGETS  
# =============================================================================

.PHONY: rebuild-onsocial-%
rebuild-onsocial-%: rebuild-docker-nodejs-% ensure-scripts-executable
	$(call log_success,onsocial-$* rebuilt via Docker image)

# =============================================================================
# JAVASCRIPT BATCH TARGETS
# =============================================================================

.PHONY: build-all-js
build-all-js: build-docker-nodejs-all
	$(call log_success,All JavaScript packages built successfully)

.PHONY: test-all-js
test-all-js: build-docker-nodejs ensure-scripts-executable
	$(call log_start,Testing All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		echo "$(BUILD) Testing $$package..."; \
		$(call docker_run_js_package,$$package,test) || exit 1; \
	done
	$(call log_success,All JavaScript packages tested successfully)

.PHONY: lint-all-js
lint-all-js: build-docker-nodejs ensure-scripts-executable
	$(call log_start,Linting All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		echo "$(BUILD) Linting $$package..."; \
		$(call docker_run_js_package,$$package,lint) || exit 1; \
	done
	$(call log_success,All JavaScript packages linted successfully)

.PHONY: format-all-js
format-all-js: build-docker-nodejs ensure-scripts-executable
	$(call log_start,Formatting All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		echo "$(BUILD) Formatting $$package..."; \
		$(call docker_run_js_package,$$package,format) || exit 1; \
	done
	$(call log_success,All JavaScript packages formatted successfully)

# =============================================================================
# OVERRIDES
# =============================================================================

# Override clean-docker-nodejs to also clean dist folders and stamp files
.PHONY: clean-docker-nodejs
clean-docker-nodejs:
	@$(MAKE) -f makefiles/docker.mk clean-docker-nodejs
	@rm -rf packages/*/dist && echo "$(SUCCESS)Dist folders cleaned$(RESET)"
	@rm -f $(JS_IMAGE_STAMP) && echo "$(SUCCESS)Stamp file cleaned$(RESET)"

