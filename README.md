[![Core CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml)
[![Staking CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/staking-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/staking-onsocial-ci.yml)
[![Token CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/token-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/token-onsocial-ci.yml)
[![Gateway CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml)
[![Relayer CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml)
[![Substreams CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/substreams-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/substreams-ci.yml)
[![Deploy Services Testnet](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.md)
[![NEAR](https://img.shields.io/badge/NEAR-Protocol-blueviolet)](https://near.org)

# OnSocial

A user-owned protocol for the next era of decentralized interactions.

---

## Quickstart

```bash
git clone https://github.com/OnSocial-Labs/onsocial-protocol.git
cd onsocial-protocol
make setup && make build && make test
```

> **Production?** See the [Deployment Guide](Resources/deployment-guide.md).

---

## Monorepo Layout

```
contracts/                  Smart contracts (Rust → WASM)
├── core-onsocial               Posts, groups, stores, permissions
├── staking-onsocial            Stake SOCIAL → earn rewards
├── token-onsocial              SOCIAL token (NEP-141)
└── marketplace-onsocial        Listings & commerce

packages/                   Backend services
├── onsocial-gateway            API gateway (GraphQL, storage, relay)
├── relayer                     Tx relayer (Rust, KMS-backed signing)
├── onsocial-rpc                NEAR RPC client
└── onsocial-portal             Portal UI

indexers/substreams/        Real-time blockchain indexing (3 sinks)

deployment/                 Docker Compose, Caddy, systemd
```

---

## CI/CD Pipeline

Every push to `main` triggers automated build → test → deploy with rollback.

### Build & Test

| Workflow | Trigger | Purpose |
|---|---|---|
| **Core CI** | `contracts/core-onsocial/**` | Build WASM + unit & integration tests |
| **Staking CI** | `contracts/staking-onsocial/**` | Build WASM + unit tests |
| **Token CI** | `contracts/token-onsocial/**` | Build WASM + unit tests |
| **Marketplace CI** | `contracts/marketplace-onsocial/**` | Build WASM + unit tests |
| **Gateway CI** | `packages/onsocial-gateway/**` | Lint, typecheck, 77 tests |
| **Relayer CI** | `packages/relayer/**` | Clippy + cargo test |
| **Substreams CI** | `indexers/substreams/**` | Check, test, pack 3 spkgs |

### Deploy

| Workflow | Trigger | Purpose |
|---|---|---|
| **Deploy Services (Testnet)** | push to `main` | Gateway + Relayer + Caddy → rolling restart |
| **Deploy Substreams (Testnet)** | after Substreams CI | 3 spkgs → restart sinks on server |
| **Deploy Services (Mainnet)** | manual (requires approval) | Same pipeline, reviewer gate |

### Verify Live Contracts

Runs every 6 hours + manual dispatch — confirms deployed code on-chain.

| Contract | Testnet | Mainnet |
|---|---|---|
| **Core** | `core.onsocial.testnet` ✅ | `core.onsocial.near` ✅ |
| **Staking** | `staking.onsocial.testnet` ✅ | — |
| **Token** | `token.onsocial.testnet` ✅ | `token.onsocial.near` ✅ |

---

## Links

[Contributing](CONTRIBUTING.md) · [Deployment Guide](Resources/deployment-guide.md) · [Make Targets](Resources/MAKE_TARGETS.md) · [Resources](Resources/README.md)

---

MIT — [LICENSE.md](LICENSE.md)
