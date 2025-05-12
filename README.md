[![Build Status](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker/Dockerfile.builder)
[![NEAR Protocol](https://img.shields.io/badge/NEAR%20Protocol-Mainnet-blueviolet)](https://near.org)
[![Linux](https://img.shields.io/badge/OS-Linux-green)](https://www.kernel.org/)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-May%2011,%202025-blue)](README.md)

# OnSocial Contracts Monorepo

**OnSocial is a bold experiment in building a gasless, decentralized social media platform on NEAR Protocol. This project is in active development—expect rapid changes, new ideas, and a relentless drive to redefine what social on-chain can be.**

This monorepo contains all core smart contracts, managed and deployed using Docker and Makefile for a reproducible, developer-friendly workflow.

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial.git
cd onsocial
make build           # Build all contracts
make build-js        # Build onsocial-js Docker image
make test            # Run all unit and integration tests
make test-js         # Run onsocial-js tests
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Contracts Overview

| Contract              | Purpose                               | Main Entrypoints (Methods)             |
| --------------------- | ------------------------------------- | -------------------------------------- |
| auth-onsocial         | User authentication, multisig         | _Main entry points are in development_ |
| ft-wrapper-onsocial   | Token transfer, cross-chain bridging  | _Main entry points are in development_ |
| relayer-onsocial      | Gasless meta-transactions, sponsoring | _Main entry points are in development_ |
| marketplace-onsocial  | Marketplace for digital assets        | _Main entry points are in development_ |
| social-onsocial       | Social media interactions             | _Main entry points are in development_ |
| staking-onsocial      | Staking and rewards                   | _Main entry points are in development_ |

## Updated Monorepo Structure

The OnSocial Contracts Monorepo is organized as follows:

- **contracts/**: Contains all core smart contracts, each in its own subdirectory:
  - `auth-onsocial/`: User authentication and multisig contract.
  - `ft-wrapper-onsocial/`: Token transfer and cross-chain bridging contract.
  - `marketplace-onsocial/`: Marketplace for digital assets contract.
  - `relayer-onsocial/`: Gasless meta-transactions and sponsoring contract.
  - `social-onsocial/`: Social media interactions contract.
  - `staking-onsocial/`: Staking and rewards contract.
- **configs/**: Configuration files for contracts and other settings.
- **docker/**: Dockerfiles for building and deploying the project.
- **near-data/**: Contains NEAR protocol-related data and configurations.
- **packages/**: Contains additional packages, including:
  - `onsocial-js/`: JavaScript utilities and tests for OnSocial.
  - `relayer/`: Relayer-specific utilities.
- **scripts/**: Shell scripts for building, deploying, testing, and managing the project.
- **tests/**: Contains integration and unit tests for the contracts.

This structure ensures modularity and ease of development for contributors.

## Makefile Quick Commands

- `make build` — Build all contracts
- `make build-js` — Build onsocial-js Docker image
- `make test` — Run all unit and integration tests
- `make test-js` — Run onsocial-js tests
- `make test-unit [CONTRACT=...]` — Run unit tests for all or a specific contract
- `make test-integration [CONTRACT=...]` — Run integration tests for all or a specific contract
- `make test-all [CONTRACT=...]` — Run all unit and integration tests (optionally for a specific contract)
- `make deploy CONTRACT=... NETWORK=... AUTH_ACCOUNT=...` — Deploy a contract
- `make start-sandbox` — Start NEAR Sandbox
- `make help` — List all available commands

## Updated Makefile Commands

The `Makefile` has been updated to include additional commands for managing the project. Below are some of the key commands:

- **Rust Contracts**:
  - `make build-rs` - Build all Rust contracts.
  - `make test-rs` - Run all unit and integration tests for Rust contracts.
  - `make deploy-rs CONTRACT=<contract> NETWORK=<network>` - Deploy a specific Rust contract.
  - `make test-all-contracts` - Run all tests for all contracts.

- **JavaScript Packages**:
  - `make build-js` - Build all JavaScript packages.
  - `make test-js` - Run tests for all JavaScript packages.
  - `make lint-js` - Lint all JavaScript packages.
  - `make format-js` - Format all JavaScript packages.

- **Sandbox Management**:
  - `make start-sandbox` - Start the NEAR Sandbox.
  - `make stop-sandbox` - Stop the NEAR Sandbox.
  - `make clean-sandbox` - Clean NEAR Sandbox data.

For a full list of commands, run `make help` in the project root.

## Makefile Reference

| Command                              | Description                                                 |
| ------------------------------------ | ----------------------------------------------------------- |
| make build                           | Build all contracts as WASM                                 |
| make build-js                        | Build Docker image for onsocial-js (uses docker/Dockerfile.onsocial-js) |
| make test                            | Run all unit and integration tests                          |
| make test-js                         | Run tests for onsocial-js                                   |
| make test-unit                       | Run unit tests for all contracts                            |
| make test-unit CONTRACT=...          | Run unit tests for a specific contract                      |
| make test-integration                | Run all integration tests                                   |
| make test-integration CONTRACT=...   | Run integration tests for a specific contract               |
| make test-all                        | Run all unit and integration tests                          |
| make test-all CONTRACT=...           | Run all unit and integration tests for a specific contract  |
| make deploy CONTRACT=... NETWORK=... | Deploy a contract to a network                              |
| make deploy-init                     | Initialize a deployed contract                              |
| make build-docker                    | Build the Docker image for development/deployment           |
| make rebuild-docker                  | Force rebuild of the Docker image                           |
| make start-sandbox                   | Start NEAR Sandbox                                          |
| make stop-sandbox                    | Stop NEAR Sandbox                                           |
| make clean-sandbox                   | Clean NEAR Sandbox data                                     |
| make init-sandbox                    | Initialize NEAR Sandbox environment                         |
| make patch-state                     | Patch sandbox state (CONTRACT_ID, KEY, VALUE required)      |
| make abi                             | Generate ABI files for all contracts                        |
| make fmt                             | Format Rust code using cargo fmt                            |
| make lint                            | Lint Rust code using cargo clippy                           |
| make lint-js                         | Lint onsocial-js code                                       |
| make format-js                       | Format onsocial-js code                                     |
| make check                           | Check workspace syntax with cargo check                     |
| make audit                           | Audit dependencies for vulnerabilities with cargo audit     |
| make check-deps                      | Check the dependency tree with cargo tree                   |
| make cargo-update                    | Update Cargo dependencies                                   |
| make upgrade-deps                    | Interactively upgrade dependencies                          |
| make clean-all                       | Clean all build artifacts and sandbox data                  |
| make verify-contract                 | Verify a specific contract (build, ABI, tests)              |
| make inspect-state                   | Inspect contract state (CONTRACT_ID, METHOD, ARGS required) |
| make logs-sandbox                    | Display NEAR Sandbox logs                                   |
| make help                            | Show all available Makefile commands and variables          |

For more details, see the Makefile itself or run `make help`.

## More Documentation

- [Deployment Guide](Resources/deployment-guide.md)
- [Contract Details](Resources/README.md)
- [onsocial-js Package](packages/onsocial-js/README.md)

## Troubleshooting

- **Docker permission denied:** Try `sudo usermod -aG docker $USER` and restart your session.
- **Build fails:** Run `make rebuild-docker` to refresh the builder image.
- **Test failures:** Ensure all dependencies are installed and the NEAR Sandbox is running.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Open issues or discussions for help or feature requests.
