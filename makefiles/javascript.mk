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
	@$(call log_start,JavaScript Dependencies Reinstall)
	@$(call log_progress,Cleaning local build artifacts)
	@rm -rf packages/*/dist
	@find packages -name "tsconfig.tsbuildinfo" -delete 2>/dev/null || true
	@$(call log_progress,Cleaning and reinstalling JavaScript dependencies)
	@rm -rf node_modules
	@docker volume create pnpm-store
	@docker run $(DOCKER_TTY) -v $(CODE_DIR):/app -v pnpm-store:/app/.pnpm-store --rm -e VERBOSE=$(VERBOSE) --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) pnpm install --frozen-lockfile --store-dir=/app/.pnpm-store
	@$(call log_success,JavaScript dependencies reinstalled successfully)

.PHONY: upgrade-deps-js
upgrade-deps-js:
	@$(call log_start,JavaScript Dependencies Upgrade)
	@$(call log_progress,Running JavaScript dependency upgrade)
	@docker volume create pnpm-store || true
	@docker run $(DOCKER_TTY) -v $(CURDIR):/app -v pnpm-store:/app/.pnpm-store --rm --user $(shell id -u):$(shell id -g) $(JS_DOCKER_IMAGE) sh /app/scripts/upgrade_deps_js.sh
	@$(call log_success,JavaScript dependencies upgraded successfully)

# =============================================================================
# JAVASCRIPT PACKAGE-SPECIFIC TARGETS
# =============================================================================

# Use unified Docker image for all packages (leverages Dockerfile.nodejs)
.PHONY: build-onsocial-%
build-onsocial-%: build-docker-nodejs ensure-scripts-executable
	@$(call log_info,Building onsocial-$* using $(JS_DOCKER_IMAGE) Docker image)
	@$(call log_progress,Building onsocial-$* package)
ifeq ($(CI),true)
	@$(call docker_run_js_package_ci,onsocial-$*,build)
else
	@$(call docker_run_js_package,onsocial-$*,build)
endif
	@$(call log_success,onsocial-$* built successfully)

.PHONY: format-onsocial-%
format-onsocial-%:
	@$(call log_progress,Formatting onsocial-$* package)
ifeq ($(CI),true)
	@$(call docker_run_js_package_ci,onsocial-$*,prettier --write .)
else
	@$(call docker_run_js_package,onsocial-$*,prettier --write .)
endif
	@$(call log_success,onsocial-$* formatted successfully)

.PHONY: lint-onsocial-%
lint-onsocial-%:
	@$(call log_progress,Linting onsocial-$* package)
ifeq ($(CI),true)
	@$(call docker_run_js_package_ci,onsocial-$*,eslint .)
else
	@$(call docker_run_js_package,onsocial-$*,eslint .)
endif
	@$(call log_success,onsocial-$* linted successfully)

.PHONY: check-onsocial-%
check-onsocial-%:
	@$(call log_progress,Type-checking onsocial-$* package)
ifeq ($(CI),true)
	@$(call docker_run_js_package_ci,onsocial-$*,tsc --noEmit)
else
	@$(call docker_run_js_package,onsocial-$*,tsc --noEmit)
endif
	@$(call log_success,onsocial-$* type-checked successfully)

.PHONY: test-onsocial-%
test-onsocial-%: build-onsocial-%
	@$(call log_progress,Testing onsocial-$* package)
ifeq ($(CI),true)
	@$(call docker_run_js_package_ci,onsocial-$*,vitest run)
else
	@$(call docker_run_js_package,onsocial-$*,vitest run)
endif
	@$(call log_success,onsocial-$* tested successfully)

# =============================================================================
# JAVASCRIPT REBUILD TARGETS  
# =============================================================================

.PHONY: rebuild-onsocial-%
rebuild-onsocial-%: rebuild-docker-nodejs ensure-scripts-executable
	$(call log_success,onsocial-$* rebuilt via Docker image)

# =============================================================================
# JAVASCRIPT BATCH TARGETS
# =============================================================================

.PHONY: build-all-js
build-all-js: build-docker-nodejs ensure-scripts-executable
	@$(call log_info,Building all JS packages using $(JS_DOCKER_IMAGE) Docker image)
	@$(foreach package,$(JS_PACKAGES), \
		$(call log_progress,Building $(package) package) && \
		$(call docker_run_js_package,$(package),build) && \
		$(call log_success,$(package) built successfully);)
	@$(call log_success,All JavaScript packages built successfully)

.PHONY: test-all-js
test-all-js: build-all-js
	@$(call log_start,Testing All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		$(call log_progress,Testing $$package package); \
		$(call docker_run_js_package,$$package,test) || exit 1; \
		$(call log_success,$$package tested successfully); \
	done
	@$(call log_success,All JavaScript packages tested successfully)

.PHONY: lint-all-js
lint-all-js: build-docker-nodejs ensure-scripts-executable
	@$(call log_start,Linting All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		$(call log_progress,Linting $$package package); \
		$(call docker_run_js_package,$$package,lint) || exit 1; \
		$(call log_success,$$package linted successfully); \
	done
	@$(call log_success,All JavaScript packages linted successfully)

.PHONY: format-all-js
format-all-js: build-docker-nodejs ensure-scripts-executable
	@$(call log_start,Formatting All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		$(call log_progress,Formatting $$package package); \
		$(call docker_run_js_package,$$package,format) || exit 1; \
		$(call log_success,$$package formatted successfully); \
	done
	@$(call log_success,All JavaScript packages formatted successfully)

.PHONY: check-all-js
check-all-js: build-docker-nodejs ensure-scripts-executable
	@$(call log_start,Type-checking All JavaScript Packages)
	@for package in $(JS_PACKAGES); do \
		$(call log_progress,Type-checking $$package package); \
		$(call docker_run_js_package,$$package,tsc --noEmit) || exit 1; \
		$(call log_success,$$package type-checked successfully); \
	done
	@$(call log_success,All JavaScript packages type-checked successfully)

# =============================================================================
# OVERRIDES
# =============================================================================

# Override clean-docker-nodejs to also clean dist folders and stamp files
.PHONY: clean-docker-nodejs
clean-docker-nodejs:
	@$(MAKE) -f makefiles/docker.mk clean-docker-nodejs
	@for dir in packages/*/dist packages/*/node_modules; do \
		if [ -d "$$dir" ]; then \
			sudo rm -rf "$$dir"; \
			mkdir -p "$$dir"; \
			chown $(shell id -u):$(shell id -g) "$$dir"; \
			echo "$$dir cleaned and recreated"; \
		fi; \
	done
	@rm -f $(JS_IMAGE_STAMP) && echo "$(SUCCESS)Stamp file cleaned$(RESET)"

