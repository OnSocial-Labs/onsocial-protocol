# OnSocial Protocol - Make Targets Reference

## 🚀 Quick Star#### Contract Build Operations
| Target | Description |
|--------|-------------|
| `build-all-contracts` | Build all contracts with optimized WASM |
| `rebuild-all-contracts` | Rebuild all contracts (fresh, no cache) |
| `build-contract-<name>` | Build specific contract |
| `rebuild-contract-<name>` | Rebuild specific contract (fresh, no cache) |
| `check-contract-<name>` | Check specific contract compilation |
| `clippy-contract-<name>` | Run clippy analysis on contract |nds

```bash
# Get started with the project
make status              # Check system status
make setup               # Setup development environment
make build-all-contracts # Build all contracts
make test-all-contracts  # Run all tests
```

## 📋 Complete Targets Reference

### 🔧 **System Management**

| Target | Description |
|--------|-------------|
| `status` | Display comprehensive system status |
| `health-check` | Verify all tools are working |
| `system-info` | Show detailed system configuration |
| `ensure-scripts-executable` | Make all scripts executable |

### 🐳 **Docker Management**

| Target | Description |
|--------|-------------|
| `build-docker-contracts` | Build contracts Docker image |
| `build-docker-nodejs` | Build Node.js Docker image |
| `build-docker-relayer` | Build relayer Docker image |
| `rebuild-docker-all` | Force rebuild all Docker images (fresh, no cache) |
| `rebuild-docker-contracts` | Force rebuild contracts Docker image |
| `rebuild-docker-nodejs` | Force rebuild Node.js Docker image |
| `rebuild-docker-relayer` | Force rebuild relayer Docker image |
| `clean-docker-all` | Clean all Docker images and containers |
| `clean-docker-<service>` | Clean specific service Docker resources |

### 📦 **JavaScript/TypeScript Packages**

#### Package Management
| Target | Description |
|--------|-------------|
| `clean-install-js` | Clean reinstall JavaScript dependencies |
| `upgrade-deps-js` | Upgrade JavaScript dependencies |

#### Package Operations
| Target | Description |
|--------|-------------|
| `build-onsocial-<package>` | Build specific package |
| `rebuild-onsocial-<package>` | Rebuild specific package (fresh, no cache) |
| `test-onsocial-<package>` | Test specific package |
| `lint-onsocial-<package>` | Lint specific package |
| `build-all-js` | Build all JavaScript packages |
| `test-all-js` | Test all JavaScript packages |
| `lint-all-js` | Lint all JavaScript packages |

**Valid packages:** `js`, `auth`, `app`, `backend`

### 🔗 **Smart Contracts**

#### Contract Build Operations
| Target | Description |
|--------|-------------|
| `build-all-contracts` | Build all contracts with optimized WASM |
| `build-contract-<name>` | Build specific contract |
| `check-contract-<name>` | Check specific contract compilation |
| `clippy-contract-<name>` | Run clippy analysis on contract |

#### Contract Testing
| Target | Description |
|--------|-------------|
| `test-all-contracts` | Run comprehensive test suite |
| `test-unit-contract-<name>` | Run unit tests for contract |
| `test-integration-contract-<name>` | Run integration tests for contract |
| `test-coverage-contract-<name>` | Generate coverage report for contract |

#### Contract Quality Assurance
| Target | Description |
|--------|-------------|
| `lint-all-contracts` | Lint all contracts |
| `format-all-contracts` | Format all contracts |
| `audit-contract-<name>` | Security audit for contract |

#### Contract Deployment
| Target | Description |
|--------|-------------|
| `deploy-contract-<name>` | Deploy contract |
| `init-contract-<name>` | Initialize deployed contract |
| `verify-contract-<name>` | Verify deployed contract |

### 🦀 **Relayer Package (Rust)**

#### Relayer Build Operations
| Target | Description |
|--------|-------------|
| `build-relayer` | Build relayer package (release mode) |
| `rebuild-relayer` | Rebuild relayer package (fresh, no cache) |
| `build-relayer-dev` | Build relayer package (development mode) |
| `check-relayer` | Check relayer compilation |
| `doc-relayer` | Generate relayer documentation |

#### Relayer Testing
| Target | Description |
|--------|-------------|
| `test-relayer` | Run all relayer tests (requires Redis) |
| `test-relayer-unit` | Run unit tests only (no Redis required) |
| `test-relayer-integration` | Run integration tests (requires Redis) |

#### Relayer Quality Assurance
| Target | Description |
|--------|-------------|
| `lint-relayer` | Run clippy on relayer code |
| `format-relayer` | Format relayer code with rustfmt |
| `audit-relayer` | Security audit relayer dependencies |

#### Relayer Development
| Target | Description |
|--------|-------------|
| `run-relayer` | Run relayer service (requires Redis) |
| `run-relayer-dev` | Run relayer in development mode |
| `watch-relayer` | Run relayer with auto-rebuild on changes |
| `clean-relayer` | Clean relayer build artifacts |
| `setup-relayer-keys` | Setup relayer cryptographic keys |

#### Relayer Comprehensive Targets
| Target | Description |
|--------|-------------|
| `relayer-full-check` | Complete relayer validation (check + lint + test + audit) |
| `relayer-ci` | CI pipeline (format + lint + unit tests) |
| `relayer-dev-setup` | Complete development environment setup |

### 🔴 **Redis Management (for Relayer)**

| Target | Description |
|--------|-------------|
| `start-redis` | Start Redis container for relayer |
| `stop-redis` | Stop and remove Redis container |
| `redis-status` | Check Redis container status |

### 🛠️ **Relayer Package**

| Target | Description |
|--------|-------------|
| `build-docker-relayer` | Build relayer Docker image |
| `clean-package-relayer` | Clean relayer package |
| `test-relayer` | Test relayer package (requires Redis) |
| `keys-relayer` | Setup relayer keys (multikey_setup.sh) |

### 🔴 **Redis Development Support**

| Target | Description |
|--------|-------------|
| `start-redis` | Start Redis container for development |
| `stop-redis` | Stop and remove Redis container |
| `redis-status` | Check Redis container status |

**Valid contract names:** `social-onsocial`, `marketplace-onsocial`, `ft-wrapper-onsocial`, `staking-onsocial`

### 🏖️ **NEAR Sandbox**

| Target | Description |
|--------|-------------|
| `init-sandbox` | Initialize NEAR sandbox |
| `start-sandbox` | Start NEAR sandbox |
| `stop-sandbox` | Stop NEAR sandbox |
| `clean-sandbox` | Clean sandbox data |
| `logs-sandbox` | Show sandbox logs |

### 🧹 **Cleanup Operations**

| Target | Description |
|--------|-------------|
| `clean-all` | Complete cleanup (all artifacts) |
| `clean-dev` | Development cleanup (preserve Docker) |
| `cache-clean` | Clean build caches |
| `cache-status` | Show cache status |

### ⚙️ **Advanced Options**

#### Environment Variables
```bash
NETWORK=testnet          # Target network (sandbox/testnet/mainnet)
VERBOSE=1               # Enable verbose output
DRY_RUN=1               # Simulate operations without changes
INIT=1                  # Deploy with initialization
REPRODUCIBLE=1          # Use reproducible builds
KEY_FILE=path/to/key    # Use specific deployment key
```

#### Deployment Examples
```bash
# Standard deployment
make deploy-contract-social-onsocial NETWORK=testnet

# Deploy with initialization
make deploy-contract-social-onsocial NETWORK=testnet INIT=1

# Deploy with specific key file
make deploy-contract-social-onsocial NETWORK=testnet KEY_FILE=./configs/keys/deployer.testnet.json

# Reproducible WASM deployment
make deploy-contract-social-onsocial NETWORK=testnet REPRODUCIBLE=1

# Dry-run simulation
make deploy-contract-social-onsocial NETWORK=testnet DRY_RUN=1
```

### 🔍 **Debugging Tips**

#### Verbose Output
```bash
VERBOSE=1 make build-all-contracts    # Enable detailed output
make --print-directory <target>       # Show directory changes
```

#### Performance Optimization
```bash
make -j$(nproc) build-all-contracts   # Parallel builds
make cache-status                     # Check cache efficiency
```

#### Common Troubleshooting
```bash
make health-check                     # Verify system setup
make clean-docker-all                 # Reset Docker state
make cache-clean                      # Clear all caches
```

## 🔐 **Security Best Practices**

### Deployment Keys
- Use `KEY_FILE` for secure deployments
- Store keys in `./configs/keys/`
- Never commit private keys to version control
- Use separate keys per network environment

### Recommended Key Structure
```
./configs/keys/
├── deployer.testnet.json
├── deployer.mainnet.json
└── test-deployer.testnet.json
```

## 📁 **File Structure**

The Makefile system is modularized across multiple files:

```
Makefile                 # Main entry point
makefiles/
├── variables.mk         # Configuration and variables
├── docker.mk           # Docker functions and utilities
├── contracts.mk        # Contract-specific targets
├── javascript.mk       # JavaScript package targets
├── relayer.mk          # Relayer package targets (Rust)
└── utilities.mk        # System utilities and diagnostics
```

## 🚀 **Getting Started Workflow**

1. **Initial Setup**
   ```bash
   make status
   make setup
   ```

2. **Development**
   ```bash
   make build-all-contracts
   make build-all-js
   make test-all-contracts
   make test-all-js
   ```

3. **Deployment Preparation**
   ```bash
   make setup-deployment-keys
   make deploy-contract-<name> NETWORK=testnet DRY_RUN=1
   ```

4. **Production Deployment**
   ```bash
   make deploy-contract-<name> NETWORK=mainnet REPRODUCIBLE=1
   ```

## 💡 **Tips and Best Practices**

- Use `make status` to verify your environment before starting
- Run `make cache-clean` if you encounter strange build issues
- Use `VERBOSE=1` to debug build problems
- Leverage parallel builds with `make -j$(nproc)` for faster builds
- Use dry-run mode to test deployments safely
- Keep deployment keys secure and separate per environment
