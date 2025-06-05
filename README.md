[![Build Status](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](docker/Dockerfile.builder)
[![NEAR Protocol](https://img.shields.io/badge/NEAR%20Protocol-Mainnet-blueviolet)](https://near.org)
[![Linux](https://img.shields.io/badge/OS-Linux-green)](https://www.kernel.org/)
[![Last Updated](https://img.shields.io/badge/Last%20Updated-May%2018,%202025-blue)](README.md)

# OnSocial Protocol

A visionary open initiative to build a decentralized, gasless social media platform on NEAR—empowering everyone to connect, create, and share freely in a privacy-first, user-owned ecosystem.

---

## Vision

- **Gasless & Seamless:** Users onboard and interact without blockchain friction. An in-app wallet provides a familiar login experience—no prior crypto knowledge required.
- **Privacy-First:** User data and identity remain under user control.
- **Open & Modular:** Designed for extensibility, composability, and community-driven innovation.

---

## Get Involved

Contributions of all kinds are welcome—code, design, documentation, and ideas. Every contribution helps shape the future of decentralized social media.

- Start contributing: [CONTRIBUTING.md](CONTRIBUTING.md)
- Join the discussion: [GitHub Issues](https://github.com/OnSocial-Labs/onsocial-protocol/issues)
- Explore the docs: [Resources/README.md](Resources/README.md)

---

## Project Structure

- `contracts/` — Core smart contracts (token, relayer, marketplace, social, staking)
- `packages/` — JavaScript SDKs and the main Expo mobile app
- `scripts/` — Automation for deployment and testing
- `tests/` — Integration and unit tests

---

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial.git
cd onsocial
make build   # Build contracts (see Makefile for more)
```
For full setup and deployment, see the [Deployment Guide](Resources/deployment-guide.md).

---

## Documentation Index

### Contracts
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

---

## Values

- **Humility:** Progress through learning and collaboration.
- **Openness:** All ideas and backgrounds are valued.
- **Impact:** Technology as a force for positive change.

---

## License

MIT — see [LICENSE.md](LICENSE.md)
