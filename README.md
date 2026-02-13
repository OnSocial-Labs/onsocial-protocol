[![Core OnSocial CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml)
[![Core Testnet](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-core-onsocial-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-core-onsocial-testnet.yml)
[![Gateway CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml)
[![Client CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-client-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-client-ci.yml)
[![Relayer CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml)
[![Deploy Testnet](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![NEAR Protocol](https://img.shields.io/badge/NEAR-Protocol-blueviolet)](https://near.org)

# OnSocial Protocol

Decentralized, gasless social media on NEAR. Privacy-first, user-owned, zero blockchain friction.

---

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial-protocol.git
cd onsocial-protocol
make setup   # Build Docker toolchains
make build   # Build contracts + packages
make test    # Run all tests
```

See [Deployment Guide](Resources/deployment-guide.md) for production setup.

---

## Architecture

```
contracts/          Smart contracts (Rust/NEAR)
├── core-onsocial       Social interactions, groups, stores
├── staking-onsocial    Staking & rewards
└── token-onsocial      SOCIAL token (NEP-141)

packages/           Services & libraries (TypeScript + Rust)
├── onsocial-gateway    API gateway — graph, storage, relay
├── onsocial-client     Browser SDK
├── onsocial-rpc        NEAR RPC client (single source of truth)
├── relayer             Tx relayer (Rust, KMS-backed keys)
├── onsocial-app        Frontend
├── onsocial-portal     Portal UI
└── onsocial-intents    NEAR intents integration

deployment/         Docker Compose, Caddy, deploy scripts
scripts/            Automation — KMS setup, secrets, env generation
tests/              Contract integration tests
```

---

## CI/CD

| Workflow | Trigger | What it does |
|---|---|---|
| Core OnSocial CI | push/PR to `contracts/` | Build + unit/integration tests |
| Gateway CI | push/PR to `packages/onsocial-gateway/` | Lint, typecheck, 77 tests |
| Client CI | push/PR to `packages/onsocial-client/` | Build + test |
| Relayer CI | push/PR to `packages/relayer/` | Clippy + cargo test |
| Deploy Testnet | push to `main` | Build images → rolling deploy to Hetzner |
| Deploy Mainnet | manual | Same as testnet, requires confirmation |

All deploys include health verification and auto-rollback.

---

## Key Links

- [Contributing](CONTRIBUTING.md)
- [Deployment Guide](Resources/deployment-guide.md)
- [Make Targets](Resources/MAKE_TARGETS.md)
- [Resources](Resources/README.md)

---

## License

MIT — [LICENSE.md](LICENSE.md)
