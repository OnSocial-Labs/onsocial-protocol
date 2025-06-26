<!-- [![Build Status](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions) -->
[![Relayer Deploy](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-relayer.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-relayer.yml)
[![OnSocial Auth](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/auth-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/auth-ci.yml)
<!-- [![OnSocial JS](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/js-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/js-ci.yml)
[![OnSocial Backend](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/backend-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/backend-ci.yml)
[![OnSocial App](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/app-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/app-ci.yml) -->
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker/Dockerfile.contracts)
[![NEAR Protocol](https://img.shields.io/badge/NEAR%20Protocol-Mainnet-blueviolet)](https://near.org)
[![Linux](https://img.shields.io/badge/OS-Linux-green)](https://www.kernel.org/)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-June%2026,%202025-blue)](README.md)

# OnSocial Protocol

A decentralized, gasless social media platform on NEAR—empowering everyone to connect, create, and share freely in a privacy-first, user-owned ecosystem. Built for openness, modularity, and seamless onboarding.

---

## Vision

- **Gasless & Seamless:** No blockchain friction—users onboard and interact with a familiar in-app wallet, no crypto knowledge required.
- **Privacy-First:** Users control their own data and identity.
- **Open & Modular:** Extensible, composable, and designed for community-driven innovation.

---

## Get Involved

Contributions of all kinds are welcome—code, design, documentation, and ideas. Every contribution helps shape the future of decentralized social media.

- Start contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Join the discussion: [GitHub Issues](https://github.com/OnSocial-Labs/onsocial-protocol/issues)
- Explore the docs: [Resources/README.md](Resources/README.md)

---

## Project Structure

- `contracts/` — Core smart contracts (token, relayer, marketplace, social, staking)
- `packages/` — JavaScript SDKs and relayer service
- `scripts/` — Automation for deployment and testing
- `tests/` — Integration and unit tests

---

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial-protocol.git
cd onsocial-protocol
make setup   # Initial setup with Docker
make build   # Build all contracts and packages
```
For full setup and deployment, see the [Deployment Guide](Resources/deployment-guide.md).

---

## Documentation Index

### Contracts
- [FT-Wrapper-OnSocial](contracts/ft-wrapper-onsocial/README.md): Token transfers and cross-chain bridging.
- [Marketplace-OnSocial](contracts/marketplace-onsocial/README.md): Marketplace for digital assets.
- [Social-OnSocial](contracts/social-onsocial/README.md): Social media interactions.
- [Staking-OnSocial](contracts/staking-onsocial/README.md): Staking and rewards.

### Packages
- [OnSocial-Auth](packages/onsocial-auth/README.md): Expo-compatible wallet authentication SDK.
- [OnSocial-JS](packages/onsocial-js/README.md): JavaScript utilities for interacting with OnSocial.
- [OnSocial-Backend](packages/onsocial-backend/README.md): Backend services and APIs.
- [OnSocial-App](packages/onsocial-app/README.md): Frontend application components.
- [Relayer](packages/relayer/README.md): Rust-based transaction relayer service.

### Resources
- [Deployment Guide](Resources/deployment-guide.md): Step-by-step instructions for deploying contracts.
- [AI Prompts](Resources/ai-prompts.md): Prompts for AI-assisted development.
- [Resources Overview](Resources/README.md): Additional guides and resources.

---

## Values

- **Humility:** Progress through learning and collaboration.
- **Openness:** All ideas and backgrounds are valued.
- **Impact:** Technology as a force for positive change.

---

## License

MIT — see [LICENSE.md](LICENSE.md)
