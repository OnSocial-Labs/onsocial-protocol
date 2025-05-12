[![Build Status](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker/Dockerfile.builder)
[![NEAR Protocol](https://img.shields.io/badge/NEAR%20Protocol-Mainnet-blueviolet)](https://near.org)
[![Linux](https://img.shields.io/badge/OS-Linux-green)](https://www.kernel.org/)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-May%2011,%202025-blue)](README.md)

# OnSocial Protocol Monorepo

**OnSocial Protocol is an initiative to build a decentralized, gasless social media platform on the NEAR Protocol. The focus is on empowering users with seamless, secure, and scalable on-chain interactions.**

This monorepo houses the core smart contracts and supporting tools, designed for streamlined development and innovation.

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

## Makefile Quick Commands

Here are some commonly used `make` commands:

- `make build` — Build all contracts.
- `make build-js` — Build all JavaScript packages.
- `make test` — Run all unit and integration tests.
- `make test-js` — Run tests for JavaScript packages.
- `make deploy CONTRACT=<contract> NETWORK=<network>` — Deploy a specific contract to a network.
- `make start-sandbox` — Start the NEAR Sandbox environment.
- `make clean-sandbox` — Clean up sandbox data.

For a full list of commands, run:

```bash
make help
```

## Makefile Documentation

For a comprehensive list of all available `make` commands, see the [Makefile Documentation](Makefile.md).

## Contracts Overview

| Contract              | Purpose                               |
| --------------------- | ------------------------------------- |
| auth-onsocial         | User authentication                   |
| ft-wrapper-onsocial   | Token transfer, token registration    |
| relayer-onsocial      | Gasless meta-transactions, sponsoring |
| marketplace-onsocial  | Marketplace for digital assets        |
| social-onsocial       | Social media interactions             |
| staking-onsocial      | Staking and rewards                   |

## Monorepo Structure

- **contracts/**: Core smart contracts for various functionalities.
- **packages/**: JavaScript utilities and app-specific tools.
- **scripts/**: Automation scripts for deployment and testing.
- **tests/**: Integration and unit tests for contracts.

## Mobile App

The `app` package in the `packages/` directory contains the main Expo-based mobile application for OnSocial. It serves as the primary interface for users to interact with the platform. For more details, see the [app README](packages/app/README.md).

## Documentation Index

Here is a list of all available documentation within the monorepo:

### Contracts
- [Auth-OnSocial](contracts/auth-onsocial/README.md): User authentication and multisignature functionality.
- [FT-Wrapper-OnSocial](contracts/ft-wrapper-onsocial/README.md): Token transfers and cross-chain bridging.
- [Marketplace-OnSocial](contracts/marketplace-onsocial/README.md): Marketplace for digital assets.
- [Relayer-OnSocial](contracts/relayer-onsocial/README.md): Gasless meta-transactions and sponsoring.
- [Social-OnSocial](contracts/social-onsocial/README.md): Social media interactions.
- [Staking-OnSocial](contracts/staking-onsocial/README.md): Staking and rewards.

### Packages
- [Main Expo App](packages/app/README.md): The primary mobile application for OnSocial.
- [OnSocial-JS](packages/onsocial-js/README.md): JavaScript utilities for interacting with OnSocial.

### Resources
- [Deployment Guide](Resources/deployment-guide.md): Step-by-step instructions for deploying contracts.
- [AI Prompts](Resources/ai-prompts.md): Prompts for AI-assisted development.
- [Resources Overview](Resources/README.md): Additional guides and resources.

This index provides quick access to all key documentation for the OnSocial Protocol.

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines. The aim is to shape the future of decentralized social media.
