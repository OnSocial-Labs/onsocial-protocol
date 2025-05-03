# OnSocial Contracts Monorepo

Welcome to the **OnSocial Contracts Monorepo**, a collection of NEAR Protocol smart contracts powering **OnSocial**, a gasless, decentralized social media platform by [OnSocial Labs](https://github.com/OnSocial-Labs). Built with **Rust**, **NEAR SDK (5.12.0)**, and **cargo-near (0.14.1)**, this monorepo supports scalable, secure, and interoperable smart contracts for social networking. A Docker-only workflow ensures consistent builds, tests, and deployments, with dependencies resolved from `Cargo.toml` files.

## Table of Contents

- [About OnSocial](#about-onsocial)
- [Key Features](#key-features)
- [Contracts](#contracts)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Directory Structure](#directory-structure)
- [Using the Makefile](#using-the-makefile)
  - [Makefile Commands](#makefile-commands)
- [Docker Workflow](#docker-workflow)
- [CI/CD](#cicd)
- [Adding New Contracts](#adding-new-contracts)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## About OnSocial

**OnSocial** is a decentralized social media platform on the NEAR Protocol, designed to deliver a seamless, gasless user experience. By leveraging smart contracts for authentication, token management, and transaction relaying, OnSocial eliminates gas fees, making social interactions accessible and secure. This monorepo houses the core contracts that enable these features, optimized for scalability and interoperability.

## Key Features

- **Gasless Transactions**: `relayer-onsocial` enables meta-transactions, allowing users to interact without paying gas fees.
- **Secure Authentication**: `auth-onsocial` supports public key authentication with multi-signature capabilities.
- **Token Interoperability**: `ft-wrapper-onsocial` facilitates fungible token transfers and cross-chain bridging.
- **Docker-Based Workflow**: Consistent builds, tests, and deployments using a single Docker image.
- **Modular Contracts**: Single-contract deployment with unique initialization via `configs/contracts.json`.
- **Robust Testing**: Unit and integration tests using NEAR Workspaces (0.18.0).
- **CI/CD Automation**: GitHub Actions for testing and testnet deployment.
- **Reproducible Builds**: WASM builds optimized for mainnet deployment.

## Contracts

- **auth-onsocial**: Manages secure user authentication with public key registration and multi-signature support.
- **ft-wrapper-onsocial**: Handles fungible token transfers and cross-chain bridging, integrated with `auth-onsocial` and `relayer-onsocial`.
- **relayer-onsocial**: Facilitates gasless meta-transactions and account sponsoring, reducing user costs.

For detailed contract descriptions and dependencies, see [Resources/README.md](Resources/README.md).

## Prerequisites

- **Hardware**: 4GB RAM, 10GB free disk space, Linux/macOS/Windows (WSL2).
- **Software**:
  - Docker: Verify with `docker --version`.
  - Git: Verify with `git --version`.
  - Make: Verify with `make --version`.
- **NEAR Accounts**:
  - Testnet/mainnet accounts via [NEAR Wallet](https://wallet.testnet.near.org/) or `near create-account`.
  - Sandbox uses `test.near` by default.

## Quickstart

### 1. Clone and Build
```bash
git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
cd onsocial-contracts
make build
```

### 2. Run Unit Tests
```bash
make test
```

### 3. Run Integration Tests
```bash
make clean-sandbox
make init-sandbox
make test-integration CONTRACT=auth-onsocial
```

### 4. Deploy a Contract (e.g., `auth-onsocial`)
```bash
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
make deploy-init CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

### 5. Interact with the Contract
```bash
docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "near call auth.sandbox register_key '{\"account_id\": \"test.near\", \"public_key\": \"ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU\", \"expiration_days\": null}' --accountId test.near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"
```

> 📘 **Note:** For deploying to testnet or mainnet, refer to [`Resources/deployment-guide.md`](Resources/deployment-guide.md).

## Directory Structure

- `.github/workflows/ci.yml`: GitHub Actions for CI/CD.
- `configs/contracts.json`: Contract deployment configurations.
- `contracts/`:
  - `auth-onsocial/`: Authentication contract.
  - `ft-wrapper-onsocial/`: Token transfer and bridging contract.
  - `relayer-onsocial/`: Gasless transaction relayer.
- `docker/Dockerfile.builder`: Docker image for builds and deployments.
- `Resources/`:
  - `deployment-guide.md`: Deployment instructions.
  - `README.md`: Contract details and dependencies.
- `scripts/`: Build, test, deploy, and sandbox management scripts.
- `tests/src/`: Integration tests for all contracts.
- `Cargo.toml`: Workspace configuration for Rust contracts and tests.
- `Makefile`: Simplifies common tasks.
- `.dockerignore` / `.gitignore`: Excludes build artifacts and sensitive files.

## Using the Makefile

The Makefile simplifies development tasks by wrapping script executions in a Docker environment. Use variables like `NETWORK`, `CONTRACT`, or `VERBOSE` to customize commands.

### Common Commands

**Build all contracts:**
```bash
make build
```

**Run unit tests:**
```bash
make test
make test-unit CONTRACT=auth-onsocial
```

**Run integration tests:**
```bash
make test-integration
make test-integration CONTRACT=ft-wrapper-onsocial
```

**Deploy a contract:**
```bash
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

**Start NEAR Sandbox:**
```bash
make start-sandbox
```

### Makefile Commands

| Command | Description |
|--------|-------------|
| `make all` | Builds and tests all contracts (default target). |
| `make build` | Builds all contracts as WebAssembly (WASM). |
| `make build-contract` | Builds a specific contract (`CONTRACT=<name>` required). |
| `make build-reproducible` | Builds reproducible WASM for mainnet deployment. |
| `make build-docker` | Builds the Docker image for development and deployment. |
| `make rebuild-docker` | Forces a rebuild of the Docker image. |
| `make abi` | Generates ABI files for all contracts. |
| `make test` | Runs unit tests for all contracts. |
| `make test-unit` | Runs unit tests for a specific contract (`CONTRACT=<name>`). |
| `make test-integration` | Runs integration tests for all or a specific contract. |
| `make test-coverage` | Generates test coverage reports (`CONTRACT=<name>` optional). |
| `make deploy` | Deploys a contract (`CONTRACT`, `NETWORK`, `AUTH_ACCOUNT` required). |
| `make deploy-init` | Initializes a deployed contract. |
| `make deploy-reproducible` | Deploys a contract with reproducible WASM. |
| `make deploy-dry-run` | Simulates deployment (`DRY_RUN=1` required). |
| `make init-sandbox` | Initializes the NEAR Sandbox environment. |
| `make start-sandbox` | Starts the NEAR Sandbox for testing and deployment. |
| `make stop-sandbox` | Stops the NEAR Sandbox. |
| `make clean-sandbox` | Cleans NEAR Sandbox data. |
| `make patch-state` | Patches sandbox state (`CONTRACT_ID`, `KEY`, `VALUE` required). |
| `make cargo-update` | Updates Cargo dependencies. |
| `make fmt` | Formats Rust code using `cargo fmt`. |
| `make lint` | Lints Rust code using `cargo clippy`. |
| `make check` | Checks workspace syntax with `cargo check`. |
| `make audit` | Audits dependencies for vulnerabilities with `cargo audit`. |
| `make check-deps` | Checks the dependency tree with `cargo tree`. |
| `make update-tools` | Updates Rust and development tools. |
| `make check-updates` | Checks for available tool updates. |
| `make clean-all` | Cleans all build artifacts and sandbox data. |
| `make verify-contract` | Verifies a specific contract (build, ABI, tests). |
| `make inspect-state` | Inspects contract state (`CONTRACT_ID`, `METHOD`, `ARGS` required). |
| `make logs-sandbox` | Displays NEAR Sandbox logs. |
| `make help` | Shows all available Makefile commands and variables. |

### Key Variables

- `NETWORK`: Network to deploy to (`sandbox`, `testnet`, `mainnet`)
- `CONTRACT`: Contract name (e.g., `auth-onsocial`)
- `AUTH_ACCOUNT`, `FT_ACCOUNT`, `RELAYER_ACCOUNT`: Account IDs
- `VERBOSE`: Set to `1` for detailed output
- `DRY_RUN`: Set to `1` for dry-run deployments

Run `make help` for full details.

## Docker Workflow

**Build Docker image:**
```bash
make build-docker
```

**Force rebuild:**
```bash
make rebuild-docker
```

**Run sandbox:**
```bash
make start-sandbox
```

**Build and test:**
```bash
make build
make test
make test-integration CONTRACT=auth-onsocial
```

**Deploy:**
```bash
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) automates:

- Building and testing contracts using Docker
- Running unit (`make test`) and integration tests (`make test-integration`)
- Optional testnet deployment (requires `NEAR_MASTER_ACCOUNT` and `NEAR_PRIVATE_KEY` secrets)

## Adding New Contracts

1. Create a new directory under `contracts/`.
2. Implement logic in `src/` and configure `Cargo.toml`.
3. Update `configs/contracts.json` with contract details.
4. Add unit tests in `contracts/<new-contract>/src/tests.rs`.
5. Add integration tests in `tests/src/`.
6. Update `scripts/test.sh` to include the new contract.
7. Verify with `make test` and `make test-integration`.

## Contributing

Contributions are welcome! Please:

- Fork the repository.
- Create a feature branch (`git checkout -b feature/xyz`).
- Ensure `make test` and `make test-integration` pass.
- Submit a pull request with clear descriptions.

See `CONTRIBUTING.md` for guidelines.

## Resources

- [NEAR Protocol Documentation](https://docs.near.org)
- [NEAR SDK Documentation](https://docs.rs/near-sdk)
- Deployment Guide: [`Resources/deployment-guide.md`](Resources/deployment-guide.md)
- Contract Details: [`Resources/README.md`](Resources/README.md)

## License

This project is licensed under the MIT License. See [`LICENSE.md`](contracts/relayer-onsocial/LICENSE.md)
