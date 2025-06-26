# OnSocial Contracts Deployment Guide

This guide explains how to deploy OnSocial contracts to NEAR (sandbox, testnet, or mainnet) using the Makefile and Docker workflow.

## Prerequisites

- Linux/macOS/Windows (WSL2)
- Docker installed and running
- NEAR account for testnet/mainnet ([create here](https://wallet.testnet.near.org/))
- This repository cloned locally

## Deployment Steps

### 1. Initial Setup

```bash
make status   # Check system requirements
make setup    # Build Docker images and setup environment
```

### 2. Build and Test (Recommended)

```bash
make build-all-contracts   # Build all contracts
make test-all-contracts    # Run all tests
```

### 3. Choose Network

Set `NETWORK` to `sandbox`, `testnet`, or `mainnet` in your commands.

### 4. Deploy Contract

```bash
make deploy-contract-ft-wrapper-onsocial NETWORK=sandbox
```

**Available contracts:**
- `ft-wrapper-onsocial` — Token transfers and cross-chain bridging
- `social-onsocial` — Social media interactions  
- `marketplace-onsocial` — Marketplace for digital assets
- `staking-onsocial` — Staking and rewards

**Deployment options:**
```bash
# Standard deployment
make deploy-contract-<name> NETWORK=testnet

# Deploy with initialization
make deploy-contract-<name> NETWORK=testnet INIT=1

# Deploy with specific key file
make deploy-contract-<name> NETWORK=testnet KEY_FILE=./configs/keys/deployer.testnet.json

# Reproducible WASM deployment
make deploy-contract-<name> NETWORK=testnet REPRODUCIBLE=1

# Dry-run simulation
make deploy-contract-<name> NETWORK=testnet DRY_RUN=1
```

### 5. Initialize Contract (Optional)

```bash
make init-contract-ft-wrapper-onsocial NETWORK=sandbox
```

Note: Most contracts auto-initialize when deployed with `INIT=1` flag.

### 6. Verify Deployment

```bash
make verify-contract-ft-wrapper-onsocial NETWORK=sandbox
```

Or check the contract state manually via NEAR CLI.

## Contract Subaccounts

Contracts are deployed to these subaccounts:

- `ft-wrapper.$NETWORK` — ft-wrapper-onsocial
- `social.$NETWORK` — social-onsocial  
- `marketplace.$NETWORK` — marketplace-onsocial
- `staking.$NETWORK` — staking-onsocial

Where `$NETWORK` is `sandbox`, `testnet`, or `mainnet`.

## Troubleshooting

- **Docker issues:** Ensure Docker is running and you have permissions (`sudo usermod -aG docker $USER`)
- **Account errors:** Make sure your NEAR account exists and has enough balance
- **Build errors:** Run `make clean-docker-all` and then `make setup`
- **Deployment key issues:** Run `make setup-deployment-keys` for help with key management

## Key Management

For production deployments, use secure key files:

```bash
# Setup deployment keys
make setup-deployment-keys

# List available keys  
make list-deployment-keys

# Validate a key file
make validate-deployment-key KEY_FILE=./configs/keys/deployer.testnet.json
```

For advanced usage and complete make targets, see the [Make Targets Reference](../docs/MAKE_TARGETS.md).
