# Step into control of your social experience.


[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE.md)
[![NEAR](https://img.shields.io/badge/NEAR-Protocol-000000?logo=near)](https://near.org)


### Contracts
[![Core CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/core-onsocial-ci.yml)
[![Staking CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/staking-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/staking-onsocial-ci.yml)
[![Token CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/token-onsocial-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/token-onsocial-ci.yml)

### Services
[![Gateway CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/onsocial-gateway-ci.yml)
[![Relayer CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/relayer-ci.yml)
[![Substreams CI](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/substreams-ci.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/substreams-ci.yml)

### Deploy
[![Deploy Services (Testnet)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/deploy-testnet.yml)

### Live Testnet
[![Core Contract](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-core-onsocial-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-core-onsocial-testnet.yml)
[![Staking Contract](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-staking-onsocial-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-staking-onsocial-testnet.yml)
[![Token Contract](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-token-onsocial-testnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-token-onsocial-testnet.yml)

### Live Mainnet
[![Token Contract](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-token-onsocial-mainnet.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/verify-token-onsocial-mainnet.yml)

### Monitoring
[![Relayer Balance](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/monitor-relayer-balance.yml/badge.svg)](https://github.com/OnSocial-Labs/onsocial-protocol/actions/workflows/monitor-relayer-balance.yml)

---

## Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://mermaid.ink/svg/Z3JhcGggVEQKICAgIENbQ2xpZW50c10gLS0-fEhUVFBTfCBDRFtDYWRkeV0KICAgIENEIC0tPiBHV1tHYXRld2F5XQogICAgR1cgLS0-IEhbSGFzdXJhXQogICAgR1cgLS0-IExIW0xpZ2h0aG91c2VdCiAgICBHVyAtLT4gTEJbUmVsYXllciBMQl0KICAgIEggLS0-IFBHWyhQb3N0Z3JlcyldCiAgICBMQiAtLT4gUjBbUmVsYXkgMF0KICAgIExCIC0tPiBSMVtSZWxheSAxXQogICAgUjAgJiBSMSAtLT58dHh8IE5FQVIKICAgIFNTW1N1YnN0cmVhbXNdIC0tPnxGaXJlaG9zZXwgTkVBUgogICAgU1MgLS0-IFBHCiAgICBzdWJncmFwaCBORUFSW05FQVIgUHJvdG9jb2xdCiAgICAgICAgQ29yZSAmIFN0YWtpbmcgJiBUb2tlbiAmIE1hcmtldHBsYWNlCiAgICBlbmQ?bgColor=0d1117">
  <img alt="OnSocial Architecture" src="https://mermaid.ink/svg/Z3JhcGggVEQKICAgIENbQ2xpZW50c10gLS0-fEhUVFBTfCBDRFtDYWRkeV0KICAgIENEIC0tPiBHV1tHYXRld2F5XQogICAgR1cgLS0-IEhbSGFzdXJhXQogICAgR1cgLS0-IExIW0xpZ2h0aG91c2VdCiAgICBHVyAtLT4gTEJbUmVsYXllciBMQl0KICAgIEggLS0-IFBHWyhQb3N0Z3JlcyldCiAgICBMQiAtLT4gUjBbUmVsYXkgMF0KICAgIExCIC0tPiBSMVtSZWxheSAxXQogICAgUjAgJiBSMSAtLT58dHh8IE5FQVIKICAgIFNTW1N1YnN0cmVhbXNdIC0tPnxGaXJlaG9zZXwgTkVBUgogICAgU1MgLS0-IFBHCiAgICBzdWJncmFwaCBORUFSW05FQVIgUHJvdG9jb2xdCiAgICAgICAgQ29yZSAmIFN0YWtpbmcgJiBUb2tlbiAmIE1hcmtldHBsYWNlCiAgICBlbmQ">
</picture>

---

## Monorepo Layout

| Directory | Description | Docs |
|---|---|---|
| **Smart Contracts** | | |
| [contracts/core-onsocial](contracts/core-onsocial) | Posts, groups, stores, permissions | [README](contracts/core-onsocial/README.md) |
| [contracts/staking-onsocial](contracts/staking-onsocial) | Stake SOCIAL → earn rewards | [README](contracts/staking-onsocial/README.md) |
| [contracts/token-onsocial](contracts/token-onsocial) | SOCIAL token (NEP-141) | [README](contracts/token-onsocial/README.md) |
| [contracts/marketplace-onsocial](contracts/marketplace-onsocial) | Listings & commerce | [README](contracts/marketplace-onsocial/README.md) |
| **Backend Services** | | |
| [packages/onsocial-gateway](packages/onsocial-gateway) | API gateway (GraphQL, storage, relay) | [README](packages/onsocial-gateway/README.md) |
| [packages/onsocial-relayer](packages/onsocial-relayer) | Tx relayer (Rust, KMS-backed signing) | [README](packages/onsocial-relayer/README.md) |
| [packages/onsocial-rpc](packages/onsocial-rpc) | NEAR RPC client | — |
| [packages/onsocial-portal](packages/onsocial-portal) | Portal UI | [README](packages/onsocial-portal/README.md) |
| **Indexing** | | |
| [indexers/substreams](indexers/substreams) | Real-time blockchain indexing (3 sinks) | [README](indexers/substreams/README.md) |
| **Infrastructure** | | |
| [deployment/](deployment) | Docker Compose, Caddy, systemd | — |

---

## Links

[Contributing](CONTRIBUTING.md) · [Deployment Guide](Resources/deployment-guide.md) · [Make Targets](Resources/MAKE_TARGETS.md) · [Resources](Resources/README.md)

---

MIT — [LICENSE.md](LICENSE.md)
