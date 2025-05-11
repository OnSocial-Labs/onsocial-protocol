# OnSocial Contracts Deployment Guide

This guide explains how to deploy OnSocial contracts to NEAR (sandbox, testnet, or mainnet) using the Makefile and Docker workflow.

## Prerequisites

- Linux/macOS/Windows (WSL2)
- Docker installed and running
- NEAR account for testnet/mainnet ([create here](https://wallet.testnet.near.org/))
- This repository cloned locally

## Deployment Steps

### 1. Build Contracts

```bash
make build
```

### 2. Run Tests (Recommended)

```bash
make test
make test-integration
```

### 3. Choose Network

Set `NETWORK` to `sandbox`, `testnet`, or `mainnet` in your commands.

### 4. Deploy Contract

Example for `auth-onsocial`:

```bash
make deploy CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

- Replace `CONTRACT` with one of: `auth-onsocial`, `ft-wrapper-onsocial`, `relayer-onsocial`
- For testnet/mainnet, set `AUTH_ACCOUNT` to your NEAR account

### 5. Initialize Contract (if required)

```bash
make deploy-init CONTRACT=auth-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

### 6. Verify Deployment

Check logs or call a view method:

```bash
make inspect-state CONTRACT_ID=auth.sandbox METHOD=get_state ARGS='{}' NETWORK=sandbox
```

## Subaccount Naming

- `auth.onsocial.$NETWORK` — auth-onsocial
- `ft-wrapper.onsocial.$NETWORK` — ft-wrapper-onsocial
- `relayer.onsocial.$NETWORK` — relayer-onsocial

## Troubleshooting

- **Docker issues:** Ensure Docker is running and you have permissions (`sudo usermod -aG docker $USER`)
- **Account errors:** Make sure your NEAR account exists and has enough balance
- **Build errors:** Run `make rebuild-docker`

For advanced usage and more details, see the [README.md](../README.md).
