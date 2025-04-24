# OnSocial Contracts Monorepo

Welcome to the **OnSocial Contracts Monorepo**, hosting NEAR smart contracts for **OnSocial**, a gasless social media application built on the [NEAR Protocol](https://near.org/) by [OnSocial Labs](https://github.com/OnSocial-Labs). This repository manages multiple smart contracts, each with unique initialization commands and deploy accounts, deployable individually using a Docker-only workflow. Dependencies are resolved from `Cargo.toml` files, ensuring consistency. Built with **Rust**, **NEAR SDK (5.12.0)**, and **cargo-near (0.14.1)**, with integration tests powered by **NEAR Workspaces (0.18.0)**.

## Table of Contents
- [About OnSocial](#about-onsocial)
- [Current Contracts](#current-contracts)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Scripts](#scripts)
- [Docker-Only Setup](#docker-only-setup)
- [CI/CD](#cicd)
- [Adding New Contracts](#adding-new-contracts)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## About OnSocial

**OnSocial** is a gasless, decentralized social media platform built on the NEAR Protocol, prioritizing user experience, security, and interoperability. The platform leverages smart contracts for secure authentication, fungible token management, and gasless meta-transactions, enabling seamless interactions without requiring users to pay gas fees. This monorepo supports scalable decentralized applications (dApps) tailored for social networking.

## Current Contracts

- **auth-onsocial**: Handles public key authentication with multi-signature support for secure user access.
- **ft-wrapper-onsocial**: Manages fungible token transfers and cross-chain bridging for asset interoperability.
- **relayer-onsocial**: Enables gasless meta-transactions and account sponsoring, reducing user friction.

See [Resources/README.md](#resources) for detailed contract descriptions and dependencies.

## Features

- Scalable monorepo supporting multiple contracts.
- Single-contract deployment with unique initialization commands defined in `configs/contracts.json`.
- Dependencies automatically resolved from `Cargo.toml` for consistent builds.
- Gasless transactions via `relayer-onsocial` for enhanced user experience.
- Secure authentication with multi-signature support in `auth-onsocial`.
- Fungible token management and cross-chain bridging via `ft-wrapper-onsocial`.
- Docker-only workflow for building, testing, and deploying contracts.
- Integration testing with NEAR Workspaces for robust validation.
- Reproducible WebAssembly (WASM) builds for mainnet deployments.
- CI/CD pipeline with GitHub Actions for automated testing and deployment.

## Prerequisites

- **Hardware**: 4GB RAM, 10GB free disk space, Linux/macOS/Windows (WSL2).
- **Software**:
  - Docker: Verify with `docker --version`.
  - Git: Verify with `git --version`.
- **NEAR Accounts**:
  - Testnet/mainnet accounts via [NEAR Wallet](https://wallet.testnet.near.org/) or `near create-account`.
  - Sandbox uses `test.near` by default.

## Quickstart

1. **Clone and Build**:
    ```bash
    git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
    cd onsocial-contracts
    docker build -t onsocial-builder -f docker/Dockerfile.builder .
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh"
    ```

   Dependencies are pulled from `Cargo.toml` files.

2. **Run Sandbox**:
    ```bash
    docker run -d -p 3030:3030 --name near-sandbox -v near-data:/root/.near nearprotocol/near-sandbox:2.5.1 --fast
    docker exec near-sandbox near-sandbox --home /root/.near init
    ```

3. **Deploy Single Contract (e.g., auth-onsocial)**:
    ```bash
    docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"
    ```

4. **Interact**:
    ```bash
    docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "near call auth.sandbox register_key '{\"account_id\": \"test.near\", \"public_key\": \"ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU\", \"expiration_days\": null}' --accountId test.near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"
    ```

See [Resources/deployment-guide.md](#resources) for testnet/mainnet deployment details.

## Getting Started

1. **Clone Repository**:
    ```bash
    git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
    cd onsocial-contracts
    ```

2. **Build Docker Image**:
    ```bash
    docker build -t onsocial-builder -f docker/Dockerfile.builder .
    ```

3. **Build Contracts**:
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh"
    ```

4. **Generate ABIs**:
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/abi.sh"
    ```

5. **Run Tests**:
    ```bash
    docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "./scripts/test.sh"
    ```

6. **Deploy Single Contract**:
    - Sandbox (e.g., ft-wrapper-onsocial):
      ```bash
      docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e FT_ACCOUNT=test.near -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract ft-wrapper-onsocial && ./scripts/deploy.sh init --contract ft-wrapper-onsocial"
      ```
    - Testnet (e.g., auth-onsocial):
      ```bash
      docker run -v $(pwd):/code --rm -e NETWORK=testnet -e AUTH_ACCOUNT=auth.testnet onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"
      ```

## Directory Structure

- `.github/workflows/ci.yml`: GitHub Actions CI/CD pipeline for automated testing and deployment.
- `configs/contracts.json`: Configuration for contract deployment (names, IDs, accounts, init commands).
- `contracts/`
  - `auth-onsocial/`: Authentication contract with multi-signature support.
    - `src/`: Source files (`errors.rs`, `events.rs`, `lib.rs`, `state_versions.rs`, `state.rs`, `tests.rs`, `types.rs`).
    - `.gitignore`: Ignores build artifacts.
    - `Cargo.toml`: Contract dependencies and build settings.
  - `ft-wrapper-onsocial/`: Fungible token wrapper for transfers and cross-chain bridging.
    - `src/`: Source files.
    - `.gitignore`: Ignores build artifacts.
    - `Cargo.toml`: Contract dependencies and build settings.
  - `relayer-onsocial/`: Gasless transaction relayer for meta-transactions and account sponsoring.
    - `src/`: Source files.
    - `.gitignore`: Ignores build artifacts.
    - `Cargo.toml`: Contract dependencies and build settings.
  - `LICENSE.md`: Contract-specific license.
  - `README.md`: Contract documentation.
- `docker/Dockerfile.builder`: Docker image for building and deploying contracts.
- `near-data/`
  - `data/`: NEAR Sandbox data storage.
  - `config.json`: NEAR node configuration.
  - `genesis.json`: NEAR genesis file.
  - `node_key.json`: NEAR node key.
  - `validator_key.json`: NEAR validator key.
- `Resources/`
  - `deployment-guide.md`: Detailed instructions for deploying to sandbox, testnet, or mainnet.
  - `README.md`: Contract details and dependency information.
- `scripts/`
  - `abi.sh`: Generates contract ABIs.
  - `build.sh`: Builds contracts.
  - `deploy.sh`: Deploys contracts.
  - `patch_state.sh`: Patches sandbox state for testing.
  - `sandbox.sh`: Manages NEAR Sandbox.
  - `test.sh`: Runs unit and integration tests.
- `tests/`
  - `src/`: Integration test source files.
  - `Cargo.toml`: Integration test configuration and dependencies.
  - `integration_tests.rs`: Integration tests for contracts.
- `.dockerignore`: Excludes files from Docker builds (e.g., `target/`, `*.wasm`).
- `.gitignore`: Excludes files from Git (e.g., `target/`, `.env`).
- `Cargo.lock`: Rust dependency lockfile.
- `Cargo.toml`: Workspace configuration for Rust contracts and tests.
- `package.json`: Node.js scripts and dependencies for convenience.
- `README.md`: This project documentation.

## Scripts

- **build.sh**: Builds contracts, ABIs, tests, or cleans artifacts. Pulls dependencies from `Cargo.toml`.
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh [reproducible|abi|test|clean]"
    ```
- **deploy.sh**: Deploys contracts, supports `--contract` for single contract deployment.
    ```bash
    docker run -v $(pwd):/code --network host --rm -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial [init|reproducible]"
    ```
- **test.sh**: Runs unit and integration tests.
    ```bash
    docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "./scripts/test.sh [integration]"
    ```
- **abi.sh**: Generates contract ABIs.
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/abi.sh"
    ```
- **sandbox.sh**: Manages Docker-based NEAR Sandbox.
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/sandbox.sh [init|run|stop|clean]"
    ```
- **patch_state.sh**: Modifies sandbox state for testing.
    ```bash
    docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "./scripts/patch_state.sh"
    ```

## Docker-Only Setup

- **Build Docker Image**:
    ```bash
    docker build -t onsocial-builder -f docker/Dockerfile.builder .
    ```
- **Run NEAR Sandbox**:
    ```bash
    docker run -d -p 3030:3030 --name near-sandbox -v near-data:/root/.near nearprotocol/near-sandbox:2.5.1 --fast
    docker exec near-sandbox near-sandbox --home /root/.near init
    ```
- **Build and Deploy**:
    ```bash
    docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh"
    docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"
    ```

## CI/CD

The GitHub Actions workflow (`.github/workflows/ci.yml`) automates:
- Building and testing contracts using Docker, pulling dependencies from `Cargo.toml`.
- Optional single-contract deployment to testnet (requires `NEAR_MASTER_ACCOUNT` and `NEAR_PRIVATE_KEY` secrets).

Example workflow:
```yaml
name: CI
on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t onsocial-builder -f docker/Dockerfile.builder .
      - name: Build contracts
        run: docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh"
      - name: Run tests
        run: docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/test.sh"
```
## Adding New Contracts

- Add new contract directory under `contracts/`.
- Implement logic in `src/` and configure `Cargo.toml`.
- Modify `scripts/deploy.sh` to support new contract deployment.
- Update tests in `tests/` for integration and unit tests.

## Contributing

- Submit a pull request with your changes.

Please follow the contributing guidelines in `CONTRIBUTING.md`.

## Resources

- [NEAR Protocol Docs](https://docs.near.org/)
- [NEAR SDK Docs](https://docs.near.org/sdk/rust/introduction)
- [OnSocial Auth Docs](https://github.com/OnSocial-Labs/onsocial-contracts/tree/main/contracts/auth-onsocial)

## License

This project is licensed under the MIT License - see the `LICENSE.md` file for details.