# OnSocial Contracts Monorepo

Welcome to the OnSocial Contracts Monorepo, the central hub for smart contracts developed by [OnSocial Labs](https://github.com/OnSocial-Labs). This repository hosts NEAR smart contracts designed to power decentralized applications (dApps) with features like authentication, token management, meta-transactions, and cross-chain interoperability. New contracts will be added as the ecosystem grows.

Current contracts include:
- **auth-onsocial**: Manages public key authentication with single and multi-signature support.
- **ft-wrapper-onsocial**: Handles fungible token (FT) transfers, storage management, and cross-chain bridging.
- **relayer-onsocial**: Facilitates gasless meta-transactions, account sponsoring, and cross-chain operations.

Built with Rust and the NEAR SDK (`5.12.0`), the contracts use `cargo-near` (v0.13.6) for streamlined building and deployment. Integration tests leverage NEAR Workspaces (`0.18.0`). The monorepo is hosted at [https://github.com/OnSocial-Labs/onsocial-contracts](https://github.com/OnSocial-Labs/onsocial-contracts).

## Table of Contents
- [About OnSocial Labs](#about-onsocial-labs)
- [Current Contracts](#current-contracts)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quickstart](#quickstart)
- [Getting Started](#getting-started)
- [Directory Structure](#directory-structure)
- [Scripts](#scripts)
- [Docker Support (Optional)](#docker-support-optional)
- [CI/CD](#cicd)
- [Adding New Contracts](#adding-new-contracts)
- [Contributing](#contributing)
- [Resources](#resources)
- [License](#license)

## About OnSocial Labs
OnSocial Labs builds decentralized solutions to enhance user experience, security, and interoperability on the NEAR blockchain. This monorepo forms the foundation of our smart contract ecosystem, supporting dApps with robust authentication, token management, and gasless transactions. Additional contracts will be integrated as the platform evolves.

## Current Contracts
- **auth-onsocial**: Secure key management with single/multi-signature authentication, key rotation, and expiration.
- **ft-wrapper-onsocial**: Fungible token management with transfer, storage deposit, and cross-chain bridging, including configurable fees.
- **relayer-onsocial**: Gasless meta-transactions, account sponsoring, and cross-chain signature relaying.

New contracts will be added to `contracts/`. Contribute or check back for updates!

## Features
- **Scalable Architecture**: Modular monorepo for adding new contracts.
- **Secure Authentication**: Multi-signature and key management for account security.
- **Token Flexibility**: Fungible token operations and cross-chain bridging.
- **Gasless Transactions**: Meta-transaction relaying for user-friendly dApps.
- **Local Testing**: NEAR Sandbox with `sandbox_patch_state` for rapid development and NEAR Workspaces for integration testing.
- **Production-Ready**: Reproducible builds for verifiable mainnet deployments.
- **Automated Workflows**: GitHub Actions for builds, tests, and deployments.

## Prerequisites
To work with this monorepo, ensure:
- **Hardware**: 4GB RAM, 10GB free disk space, Linux (Ubuntu/Debian), macOS, or Windows (via WSL2).
- **Software**:
  - [Rust](https://www.rust-lang.org/tools/install) (1.80.0):
    ```bash
    rustup install 1.80.0
    rustup default 1.80.0
    rustup target add wasm32-unknown-unknown
    ```
  - [cargo-near](https://crates.io/crates/cargo-near) (v0.13.6):
    ```bash
    cargo install cargo-near --version 0.13.6
    ```
  - [near-cli](https://github.com/near/near-cli) and [near-sandbox](https://github.com/near/near-sandbox):
    ```bash
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo bash -
    sudo apt-get install -y nodejs
    npm install -g near-cli near-sandbox
    ```
  - [NEAR Workspaces](https://github.com/near/near-workspaces-rs) (v0.18.0, for integration tests):
    Included as a dev-dependency in contract crates and `tests/`.
  - [Git](https://git-scm.com/downloads):
    ```bash
    git --version
    ```
  - Build tools (for Linux/WSL2):
    ```bash
    sudo apt-get install -y build-essential curl git
    ```
  - [Docker](https://www.docker.com/get-started) and [Docker Compose](https://docs.docker.com/compose/install/) (optional):
    ```bash
    docker --version
    docker-compose --version
    ```
- **NEAR Accounts**: Testnet/mainnet accounts via [NEAR Wallet](https://wallet.testnet.near.org) or `cargo near create-dev-account`.

## Quickstart
Get started with these common tasks in the NEAR Sandbox:
1. **Clone and Build**:
   ```bash
   git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
   cd onsocial-contracts
   ./scripts/build.sh

Run Sandbox:
bash

./scripts/sandbox.sh init
./scripts/sandbox.sh run

Deploy Contracts (single account):
bash

./scripts/deploy.sh
./scripts/deploy.sh init

Deploy with Different Accounts:
bash

near create-account auth.test.near --masterAccount test.near --initialBalance 10 --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json
near create-account ft-wrapper.test.near --masterAccount test.near --initialBalance 10 --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json
near create-account relayer.test.near --masterAccount test.near --initialBalance 10 --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json
export AUTH_ACCOUNT=auth.test.near
export FT_ACCOUNT=ft-wrapper.test.near
export RELAYER_ACCOUNT=relayer.test.near
./scripts/deploy.sh
./scripts/deploy.sh init

Interact with Contracts:
bash

near call auth.sandbox register_key '{"account_id": "test.near", "public_key": "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU", "expiration_days": null}' --accountId test.near --nodeUrl http://localhost:3030

For testnet/mainnet or detailed instructions, see Resources/deployment-guide.md (#resources).
Getting Started
Clone the Repository:
bash

git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
cd onsocial-contracts

Install Dependencies:
Follow Prerequisites (#prerequisites) to set up Rust, cargo-near, near-cli, near-sandbox, and NEAR Workspaces.

Clean Build Artifacts (Optional):
bash

./scripts/build.sh clean

Build Contracts:
bash

./scripts/build.sh  # Non-reproducible for local testing
./scripts/build.sh reproducible  # Reproducible for production

Generate ABIs:
bash

./scripts/abi.sh

Run Tests:
Unit tests for all contracts:
bash

./scripts/test.sh

Integration tests only (requires NEAR Sandbox):
bash

./scripts/sandbox.sh init
./scripts/sandbox.sh run
./scripts/test.sh integration

Deploy Contracts:
Sandbox (Single Account):
bash

./scripts/sandbox.sh init
./scripts/sandbox.sh run
./scripts/deploy.sh
./scripts/deploy.sh init

Sandbox (Different Accounts):
See Quickstart (#quickstart) for sub-account creation and deployment.

Testnet:
bash

export NETWORK=testnet
export AUTH_ACCOUNT=auth-account.testnet
export FT_ACCOUNT=ft-account.testnet
export RELAYER_ACCOUNT=relayer-account.testnet
near login --accountId auth-account.testnet
near login --accountId ft-account.testnet
near login --accountId relayer-account.testnet
./scripts/deploy.sh
./scripts/deploy.sh init

Mainnet:
Use reproducible builds and funded accounts (20+ NEAR each):
bash

export NETWORK=mainnet
export AUTH_ACCOUNT=auth-account.near
export FT_ACCOUNT=ft-account.near
export RELAYER_ACCOUNT=relayer-account.near
./scripts/deploy.sh reproducible
./scripts/deploy.sh init

For detailed deployment steps, including account creation and funding, see Resources/deployment-guide.md (#resources).
Directory Structure

onsocial-contracts/
├── contracts/
│   ├── auth-onsocial/          # Authentication contract
│   ├── ft-wrapper-onsocial/    # Fungible token management contract
│   ├── relayer-onsocial/       # Meta-transaction relayer contract
├── scripts/
│   ├── build.sh                # Build WASM and ABIs
│   ├── deploy.sh               # Deploy contracts
│   ├── test.sh                 # Run unit and integration tests
│   ├── abi.sh                  # Generate ABIs
│   ├── sandbox.sh              # Manage NEAR Sandbox
│   ├── patch_state.sh          # Manipulate contract state for testing
├── docker/
│   ├── Dockerfile.builder      # Docker image for building
│   ├── docker-compose.yml      # Docker Compose configuration
├── Resources/
│   ├── README.md               # Additional resources
│   ├── deployment-guide.md     # Detailed deployment guide
├── tests/
│   ├── src/                    # Integration tests using NEAR Workspaces
│   ├── Cargo.toml              # Integration test crate configuration
├── .github/
│   ├── workflows/
│   │   ├── ci.yml              # GitHub Actions workflow
├── Cargo.toml                  # Rust workspace configuration
├── README.md                   # This file
├── .gitignore                  # Git ignore rules

Scripts
Scripts manage all contracts and scale with new additions:
build.sh: Builds contracts, generates ABIs, runs tests, or cleans artifacts. Automatically detects contracts from Cargo.toml.
bash

./scripts/build.sh          # Non-reproducible build
./scripts/build.sh reproducible  # Reproducible build
./scripts/build.sh abi      # Generate ABIs
./scripts/build.sh test     # Run tests
./scripts/build.sh clean    # Remove build artifacts

deploy.sh: Deploys contracts to Sandbox, testnet, or mainnet, supporting different accounts per contract.
bash

./scripts/deploy.sh         # Deploy to configured network
./scripts/deploy.sh init    # Initialize contracts
./scripts/deploy.sh reproducible  # Deploy with reproducible builds

test.sh: Runs unit tests for all contracts or integration tests only.
bash

./scripts/test.sh           # Run unit and integration tests
./scripts/test.sh integration  # Run integration tests only

abi.sh: Generates ABI schemas for frontend integration.
bash

./scripts/abi.sh

sandbox.sh: Manages NEAR Sandbox for local testing.
bash

./scripts/sandbox.sh init   # Initialize Sandbox
./scripts/sandbox.sh run    # Run Sandbox
./scripts/sandbox.sh stop   # Stop Sandbox
./scripts/sandbox.sh clean  # Clean Sandbox data

patch_state.sh: Manipulates contract state in Sandbox for testing edge cases.
bash

./scripts/patch_state.sh

Docker Support (Optional)
Docker provides a consistent build environment but is not required. Use native tools (Rust, cargo-near, etc.) for simpler setup, especially if encountering image issues (e.g., nearprotocol/near-sandbox pull errors).
Build and Run:
bash

docker-compose up

Clean Artifacts:
bash

docker-compose run builder bash -c "./scripts/build.sh clean"

See docker/docker-compose.yml and docker/Dockerfile.builder for details. If Docker fails, follow the native workflow in Getting Started (#getting-started).
CI/CD
GitHub Actions (.github/workflows/ci.yml) automates:
Build and Test: Runs ./scripts/build.sh, ./scripts/abi.sh, and ./scripts/test.sh on push/pull requests to main.

Deploy: Deploys to testnet on main branch pushes, using secrets (NEAR_MASTER_ACCOUNT, NEAR_PRIVATE_KEY).

Add secrets in GitHub repository settings to enable deployment.
Adding New Contracts
Create Contract:
bash

cd contracts
cargo near new my-new-contract

Update Workspace:
Add to Cargo.toml:
toml

[workspace]
members = [
    "contracts/auth-onsocial",
    "contracts/ft-wrapper-onsocial",
    "contracts/relayer-onsocial",
    "contracts/my-new-contract",
    "tests",
]

Test and Deploy:
bash

./scripts/test.sh
./scripts/build.sh
./scripts/deploy.sh

Document:
Update Current Contracts (#current-contracts) and Resources/deployment-guide.md.

Scripts automatically detect new contracts from Cargo.toml, so no manual updates to CONTRACTS arrays are needed.
Contributing
We welcome contributions! To contribute:
Fork the repository.

Create a feature branch (git checkout -b feature/your-feature).

Commit changes (git commit -m "Add your feature").

Push to your fork (git push origin feature/your-feature).

Open a pull request.

Follow the Code of Conduct (CODE_OF_CONDUCT.md) and Contributing Guidelines (CONTRIBUTING.md) (to be added). Report issues at https://github.com/OnSocial-Labs/onsocial-contracts/issues.
Resources
Deployment Guide (Resources/deployment-guide.md): Instructions for deploying to Sandbox, testnet, or mainnet.

NEAR Documentation: Official NEAR Protocol docs.

cargo-near Documentation: Guide for cargo-near commands.

NEAR Workspaces: Integration testing framework.

NEAR Sandbox: Local blockchain setup.

OnSocial Labs: Organization page.

NEAR Discord: Community support.

License
Licensed under the Apache License 2.0 (LICENSE-APACHE) or MIT License (LICENSE-MIT), at your option. See LICENSE for details.

