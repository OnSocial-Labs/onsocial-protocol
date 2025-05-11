[![Build Status](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker/Dockerfile.builder)
[![NEAR Protocol](https://img.shields.io/badge/NEAR%20Protocol-Mainnet-blueviolet)](https://near.org)

# OnSocial Contracts Monorepo

**OnSocial is a bold experiment in building a gasless, decentralized social media platform on NEAR Protocol. This project is in active development—expect rapid changes, new ideas, and a relentless drive to redefine what social on-chain can be.**

This monorepo contains all core smart contracts, managed and deployed using Docker and Makefile for a reproducible, developer-friendly workflow.

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial.git
cd onsocial
make build           # Build all contracts
make test            # Run all unit and integration tests
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Contracts Overview

| Contract            | Purpose                               | Main Entrypoints (Methods)             |
| ------------------- | ------------------------------------- | -------------------------------------- |
| auth-onsocial       | User authentication, multisig         | _Main entry points are in development_ |
| ft-wrapper-onsocial | Token transfer, cross-chain bridging  | _Main entry points are in development_ |
| relayer-onsocial    | Gasless meta-transactions, sponsoring | _Main entry points are in development_ |

## Makefile Quick Commands

- `make build` — Build all contracts
- `make test` — Run all unit and integration tests
- `make test-unit [CONTRACT=...]` — Run unit tests for all or a specific contract
- `make test-integration [CONTRACT=...]` — Run integration tests for all or a specific contract
- `make test-all [CONTRACT=...]` — Run all unit and integration tests (optionally for a specific contract)
- `make deploy CONTRACT=... NETWORK=... AUTH_ACCOUNT=...` — Deploy a contract
- `make start-sandbox` — Start NEAR Sandbox
- `make help` — List all available commands

## Makefile Reference

| Command                              | Description                                                 |
| ------------------------------------ | ----------------------------------------------------------- |
| make build                           | Build all contracts as WASM                                 |
| make test                            | Run all unit and integration tests                          |
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

## Troubleshooting

- **Docker permission denied:** Try `sudo usermod -aG docker $USER` and restart your session.
- **Build fails:** Run `make rebuild-docker` to refresh the builder image.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Open issues or discussions for help or feature requests.
