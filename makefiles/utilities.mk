# =============================================================================
# SYSTEM UTILITIES AND DIAGNOSTICS
# =============================================================================
# OnSocial Protocol - System Utilities, Cache Management, and Diagnostics
#
# Note: This file should only be included from the main Makefile
# Variables and functions are provided by variables.mk and docker.mk

# =============================================================================
# SANDBOX MANAGEMENT
# =============================================================================

.PHONY: init-sandbox
init-sandbox: ensure-scripts-executable
	@CODE_DIR="$(CODE_DIR)" CONTRACTS_DOCKER_IMAGE="$(CONTRACTS_DOCKER_IMAGE)" NEAR_SANDBOX_PORT="$(NEAR_SANDBOX_PORT)" VERBOSE="$(VERBOSE)" ./scripts/sandbox.sh init

.PHONY: start-sandbox
start-sandbox: ensure-scripts-executable
	@CODE_DIR="$(CODE_DIR)" CONTRACTS_DOCKER_IMAGE="$(CONTRACTS_DOCKER_IMAGE)" NEAR_SANDBOX_PORT="$(NEAR_SANDBOX_PORT)" VERBOSE="$(VERBOSE)" ./scripts/sandbox.sh start

.PHONY: stop-sandbox
stop-sandbox: ensure-scripts-executable
	@CODE_DIR="$(CODE_DIR)" CONTRACTS_DOCKER_IMAGE="$(CONTRACTS_DOCKER_IMAGE)" NEAR_SANDBOX_PORT="$(NEAR_SANDBOX_PORT)" VERBOSE="$(VERBOSE)" ./scripts/sandbox.sh stop

.PHONY: clean-sandbox
clean-sandbox: ensure-scripts-executable
	@CODE_DIR="$(CODE_DIR)" CONTRACTS_DOCKER_IMAGE="$(CONTRACTS_DOCKER_IMAGE)" NEAR_SANDBOX_PORT="$(NEAR_SANDBOX_PORT)" VERBOSE="$(VERBOSE)" ./scripts/sandbox.sh clean

.PHONY: logs-sandbox
logs-sandbox: ensure-scripts-executable
	@CODE_DIR="$(CODE_DIR)" CONTRACTS_DOCKER_IMAGE="$(CONTRACTS_DOCKER_IMAGE)" NEAR_SANDBOX_PORT="$(NEAR_SANDBOX_PORT)" VERBOSE="$(VERBOSE)" ./scripts/sandbox.sh logs

# =============================================================================
# SYSTEM DIAGNOSTICS
# =============================================================================

.PHONY: status
status:
	$(call log_start,System Status Check)
	@echo "==================================================================="
	@echo "OnSocial Protocol Build System Status"
	@echo "==================================================================="
	$(call log_info,System Information)
	@echo "   CPU Cores: $(shell nproc) (tip: use make -j$(shell nproc) for parallel builds)"
	@echo "   Make Jobs: $(shell echo $$MAKEFLAGS | grep -o '\-j[0-9]*' || echo 'single-threaded (default)')"
	@echo "   Network: $(NETWORK)"
	@echo "   Working Dir: $(CODE_DIR)"
	@echo ""
	$(call log_info,Build Tools Status)
	@echo "   Rust: $(shell rustc --version 2>/dev/null || echo 'not found')"
	@echo "   Node.js: $(shell node --version 2>/dev/null || echo 'not found')" 
	@echo "   pnpm: $(shell pnpm --version 2>/dev/null || echo 'not found')"
	@echo "   Docker: $(shell docker --version 2>/dev/null || echo 'not found')"
	@echo "   NEAR CLI: $(shell near --version 2>/dev/null || echo 'not found')"
	@echo ""
	$(call log_info,Project Packages)
	@echo "   Contracts: $(VALID_CONTRACTS)"
	@echo "   JS Packages: $(JS_PACKAGES)"; 
	@echo "   Rust Packages: $(RS_PACKAGES)"
	@echo ""
	$(call log_info,Docker Images Status)
	@docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" | grep -E "(onsocial|contracts|relayer|builder)" || echo "   No OnSocial images found"
	@echo "=================================================================="
	$(call log_complete,System Status Check)

.PHONY: health-check
health-check:
	$(call log_start,System Health Check)
	$(call log_progress,Checking Docker)
	@docker --version
	$(call log_progress,Checking NEAR CLI)
	@docker run --rm -it $(CONTRACTS_DOCKER_IMAGE) near --version
	$(call log_progress,Checking Node.js)
	@docker run --rm -it $(JS_DOCKER_IMAGE) node --version
	$(call log_progress,Checking Rust)
	@docker run --rm -it $(CONTRACTS_DOCKER_IMAGE) rustc --version
	$(call log_success,Health check completed)

.PHONY: system-info
system-info:
	@echo "==================================================================="
	@echo "OnSocial Protocol - System Information"
	@echo "==================================================================="
	@echo "Network: $(NETWORK)"
	@echo "Auth Account: $(AUTH_ACCOUNT)"
	@echo "FT Account: $(FT_ACCOUNT)"
	@echo "Relayer Account: $(RELAYER_ACCOUNT)"
	@echo "NEAR Node URL: $(NEAR_NODE_URL)"
	@echo "Code Directory: $(CODE_DIR)"
	@echo ""
	@echo "Contracts: $(VALID_CONTRACTS)"
	@echo "JS Packages: $(JS_PACKAGES)"
	@echo "Rust Packages: $(RS_PACKAGES)"
	@echo ""
	@echo "Docker Images:"
	@echo "  Contracts: $(CONTRACTS_DOCKER_IMAGE)"
	@echo "  JavaScript: $(JS_DOCKER_IMAGE)"
	@echo "  Relayer: $(RS_DOCKER_IMAGE)"
	@echo "==================================================================="

# =============================================================================
# CACHE MANAGEMENT
# =============================================================================

.PHONY: cache-status
cache-status:
	@echo "$(SEARCH) Build Cache Status"
	@echo "==================================================================="
	@echo "Build Cache Status"
	@echo "==================================================================="
	@echo "$(FOLDER) Cache Directory: $(CACHE_DIR)"
	@if [ -d "$(CACHE_DIR)" ]; then \
		echo "$(CHART) Cache Size: $$(du -sh $(CACHE_DIR) 2>/dev/null | cut -f1)"; \
		echo "$(FILE) Cache Files:"; \
		ls -la $(CACHE_DIR)/ 2>/dev/null || echo "   No cache files found"; \
	else \
		echo "$(ERROR)Cache directory does not exist$(RESET)"; \
	fi
	@echo "=================================================================="

.PHONY: cache-clean
cache-clean:
	@echo "$(CLEAN) Cache cleanup: removing build cache, Docker cache, and pnpm cache..."
	@echo "Cleaning build cache directory..."
	@rm -rf $(CACHE_DIR)
	@mkdir -p $(CACHE_DIR) $(DOCKER_CACHE_DIR)
	@echo "Cleaning pnpm cache..."
	@if command -v pnpm >/dev/null 2>&1; then \
		pnpm store prune && echo "pnpm cache cleaned"; \
	else \
		echo "pnpm not found, skipping pnpm cache cleanup"; \
	fi
	@echo "Cleaning Docker build cache..."
	@if command -v docker >/dev/null 2>&1; then \
		docker builder prune -f >/dev/null && echo "Docker build cache cleaned"; \
	else \
		echo "Docker not found, skipping Docker cache cleanup"; \
	fi
	@echo "$(SUCCESS)All caches cleaned$(RESET)"

# =============================================================================
# CLEANUP TARGETS
# =============================================================================

.PHONY: clean-all
clean-all:
	@echo ""
	@echo "$(WARNING)⚠️  DESTRUCTIVE OPERATION WARNING ⚠️$(RESET)"
	@echo ""
	@echo "$(CLEAN) This will completely clean the OnSocial Protocol workspace:"
	@echo "  $(ERROR)• Remove ALL Docker images and containers$(RESET)"
	@echo "  $(ERROR)• Stop and remove Redis container$(RESET)"
	@echo "  $(ERROR)• Delete all node_modules directories$(RESET)"
	@echo "  $(ERROR)• Delete all dist, build, and target directories$(RESET)"
	@echo "  $(ERROR)• Clean all package manager caches$(RESET)"
	@echo "  $(ERROR)• Clean sandbox environment$(RESET)"
	@echo ""
	@echo "$(INFO)This operation cannot be undone!$(RESET)"
	@echo "$(WARNING)Note: May require sudo for Docker and Rust target cleanup$(RESET)"
	@echo ""
	@printf "$(WARNING)Are you sure you want to continue? (y/N): $(RESET)"; \
	read -r answer; \
	case "$$answer" in \
		[yY]|[yY][eE][sS]) \
			echo ""; \
			echo "$(ROCKET) Proceeding with comprehensive cleanup..."; \
			$(MAKE) clean-sandbox clean-docker-all; \
			echo "$(CLEAN) Stopping Redis container..."; \
			if docker ps -q --filter "name=redis-onsocial" | grep -q .; then \
				docker stop redis-onsocial >/dev/null 2>&1; \
				docker rm redis-onsocial >/dev/null 2>&1; \
				echo "Redis container stopped and removed"; \
			else \
				echo "Redis container was not running"; \
			fi; \
			echo "$(CLEAN) Cleaning remaining build artifacts..."; \
			echo "Cleaning JavaScript dependencies..."; \
			if [ -d "node_modules" ]; then rm -rf node_modules && echo "Root node_modules removed"; fi; \
			for dir in packages/*/node_modules; do \
				if [ -d "$$dir" ]; then \
					rm -rf "$$dir" && echo "$$dir removed"; \
				fi; \
			done; \
			for dir in packages/*/dist packages/*/build; do \
				if [ -d "$$dir" ]; then \
					rm -rf "$$dir" && echo "$$dir removed"; \
				fi; \
			done; \
			echo "Cleaning Rust target directories..."; \
			for dir in target contracts/*/target packages/relayer/target; do \
				if [ -d "$$dir" ]; then \
					if rm -rf "$$dir" 2>/dev/null; then \
						echo "$$dir removed"; \
					else \
						echo "Permission denied for $$dir, trying with sudo..."; \
						sudo rm -rf "$$dir" && echo "$$dir removed (with sudo)"; \
					fi; \
				fi; \
			done; \
			echo "Cleaning pnpm cache..."; \
			if command -v pnpm >/dev/null 2>&1; then \
				pnpm store prune && echo "pnpm cache cleaned"; \
			else \
				echo "pnpm not found, skipping cache cleanup"; \
			fi; \
			echo "$(SUCCESS)Complete cleanup finished - all artifacts and Docker resources removed$(RESET)"; \
			;; \
		*) \
			echo ""; \
			echo "$(INFO)Operation cancelled$(RESET)"; \
			exit 0; \
			;; \
	esac

.PHONY: clean-dev
clean-dev: clean-sandbox
	@echo "$(CLEAN) Development cleanup: removing build artifacts..."
	@echo "Cleaning JavaScript build outputs..."
	@for dir in packages/*/dist packages/*/build packages/*/.next; do \
		if [ -d "$$dir" ]; then \
			rm -rf "$$dir" && echo "$$dir removed"; \
		fi; \
	done
	@echo "Cleaning Rust build artifacts..."
	@if docker images -q $(CONTRACTS_DOCKER_IMAGE) | grep -q .; then \
		docker run --rm -v $(CODE_DIR):/code -e VERBOSE=$(VERBOSE) $(CONTRACTS_DOCKER_IMAGE) \
			bash -c "cargo clean" && echo "Rust artifacts cleaned"; \
	else \
		echo "Contracts Docker image not found, skipping Rust cleanup"; \
	fi
	@echo "$(SUCCESS)Development cleanup completed$(RESET)"

# =============================================================================
# REDIS DEVELOPMENT SUPPORT
# =============================================================================

.PHONY: start-redis
start-redis:
	$(call log_start,Starting Redis Container)
	@if docker ps -q --filter "name=redis-onsocial" | grep -q .; then \
		echo "$(INFO)Redis container already running$(RESET)"; \
	else \
		if docker ps -aq --filter "name=redis-onsocial" | grep -q .; then \
			echo "$(INFO)Removing existing redis-onsocial container...$(RESET)"; \
			docker rm redis-onsocial >/dev/null 2>&1; \
		fi; \
		echo "$(BUILD) Starting new Redis container...$(RESET)"; \
		docker run -d --name redis-onsocial -p 6379:6379 $(EXTERNAL_REDIS_IMAGE) >/dev/null; \
		sleep 2; \
		if docker ps -q --filter "name=redis-onsocial" | grep -q .; then \
			echo "$(SUCCESS)Redis container started successfully on port 6379$(RESET)"; \
		else \
			echo "$(ERROR)Failed to start Redis container$(RESET)"; \
			exit 1; \
		fi; \
	fi
	$(call log_success,Redis startup completed)

.PHONY: stop-redis
stop-redis:
	$(call log_start,Stopping Redis Container)
	@if docker ps -q --filter "name=redis-onsocial" | grep -q .; then \
		echo "$(BUILD) Stopping Redis container...$(RESET)"; \
		docker stop redis-onsocial >/dev/null 2>&1; \
		docker rm redis-onsocial >/dev/null 2>&1; \
		echo "$(SUCCESS)Redis container stopped and removed$(RESET)"; \
	else \
		echo "$(INFO)Redis container is not running$(RESET)"; \
	fi

.PHONY: redis-status
redis-status:
	@if docker ps -q --filter "name=redis-onsocial" | grep -q .; then \
		echo "$(SUCCESS)Redis container is running$(RESET)"; \
		echo "$(INFO)Port: 6379$(RESET)"; \
		echo "$(INFO)Container: redis-onsocial$(RESET)"; \
	else \
		echo "$(WARNING)Redis container is not running$(RESET)"; \
		echo "$(INFO)Start with: make start-redis$(RESET)"; \
	fi

# =============================================================================
# UTILITY TARGETS
# =============================================================================

.PHONY: ensure-scripts-executable
ensure-scripts-executable:
	$(call log_progress,Ensuring scripts are executable)
	@chmod +x scripts/*.sh
	$(call log_success,Scripts permissions set successfully)
