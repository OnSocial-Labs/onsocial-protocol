# Deployment Guide

This guide outlines how to deploy individual smart contracts (e.g., `auth-onsocial`, `ft-wrapper-onsocial`, etc.) from the OnSocial Labs monorepo to a NEAR Sandbox, testnet, or mainnet using a Docker-only workflow. Each contract has a unique initialization command defined in `configs/contracts.json`. Dependencies are automatically pulled from `Cargo.toml` files, supporting 6-10 contracts with single-contract deployment via the `--contract` flag.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Building the Contracts](#building-the-contracts)
- [Deploying a Single Contract](#deploying-a-single-contract)
- [Deploying to NEAR Sandbox](#deploying-to-near-sandbox)
- [Deploying to NEAR Testnet](#deploying-to-near-testnet)
- [Deploying to NEAR Mainnet](#deploying-to-near-mainnet)
- [Verifying Deployments](#verifying-deployments)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview
The monorepo contains multiple NEAR smart contracts, each with unique initialization commands and deploy accounts, configured in `configs/contracts.json`. Dependencies are resolved from `Cargo.toml` files during the Docker build. Key contracts include:
- **auth-onsocial**: Public key authentication with multi-signature support.
- **ft-wrapper-onsocial**: Fungible token transfers and cross-chain bridging.
- **relayer-onsocial**: Gasless meta-transactions and account sponsoring.
- **new-contract1, new-contract2, new-contract3**: Placeholder contracts.

Deployment involves building WebAssembly (WASM) files, deploying via `near-cli` or `cargo-near`, and initializing with contract-specific commands.

## Prerequisites
### Hardware
- 4GB RAM, 10GB free disk space.
- Linux (Ubuntu/Debian), macOS, or Windows (WSL2).

### Software
- **Docker**:
  ```bash
  docker --version

Git:
bash

git --version

Repository:
bash

git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
cd onsocial-contracts

NEAR Accounts
Testnet/Mainnet: Create accounts via NEAR Wallet or near create-account.

Sandbox: Uses test.near by default.

Setup
Verify Directory Structure:

onsocial-contracts/
├── contracts/
│   ├── auth-onsocial/
│   ├── ft-wrapper-onsocial/
│   ├── relayer-onsocial/
│   ├── new-contract1/
│   ├── new-contract2/
│   ├── new-contract3/
├── scripts/
├── docker/
├── Resources/
├── tests/
├── configs/
├── .github/
├── Cargo.toml
├── README.md
├── .gitignore
├── package.json

Build Docker Image:
bash

docker build -t onsocial-builder -f docker/Dockerfile.builder .

This pulls Rust dependencies from Cargo.toml files and installs cargo-near, near-cli, and near-sandbox.

Configure Accounts:
Set environment variables or use .env:
bash

echo "AUTH_ACCOUNT=auth.testnet" >> .env
echo "FT_ACCOUNT=ft.testnet" >> .env
echo "RELAYER_ACCOUNT=relayer.testnet" >> .env
echo "NEW1_ACCOUNT=new1.testnet" >> .env
echo "NEW2_ACCOUNT=new2.testnet" >> .env
echo "NEW3_ACCOUNT=new3.testnet" >> .env

Building the Contracts
Build WASM Files:
bash

docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh"

For production:
bash

docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh reproducible"

Dependencies are pulled from Cargo.toml and cached in the Docker image.

Generate ABIs:
bash

docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/abi.sh"

Run Tests:
bash

docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "./scripts/test.sh"

Deploying a Single Contract
To deploy one contract (e.g., auth-onsocial) with its unique init code:
Start Sandbox (if needed):
bash

docker run -d -p 3030:3030 --name near-sandbox -v near-data:/root/.near nearprotocol/near-sandbox:2.5.1 --fast
docker exec near-sandbox near-sandbox --home /root/.near init

Deploy:
bash

docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"

For Other Contracts:
Example for ft-wrapper-onsocial:
bash

docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e FT_ACCOUNT=test.near -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract ft-wrapper-onsocial && ./scripts/deploy.sh init --contract ft-wrapper-onsocial"

Deploying to NEAR Sandbox
Deploy Single Contract:
bash

docker run -v $(pwd):/code --network host --rm -e NETWORK=sandbox -e AUTH_ACCOUNT=test.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"

Test Interactions:
bash

docker run -v $(pwd):/code --network host --rm onsocial-builder bash -c "near call auth.sandbox register_key '{\"account_id\": \"test.near\", \"public_key\": \"ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU\", \"expiration_days\": null}' --accountId test.near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json"

Clean Up:
bash

docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/sandbox.sh stop"
docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/sandbox.sh clean"

Deploying to NEAR Testnet
Create/Fund Account:
bash

near create-account auth.testnet --masterAccount your-account.testnet

Fund via NEAR Testnet Faucet.

Deploy Single Contract:
bash

docker run -v $(pwd):/code --rm -e NETWORK=testnet -e AUTH_ACCOUNT=auth.testnet onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial && ./scripts/deploy.sh init --contract auth-onsocial"

Verify:
bash

near state auth.testnet

Deploying to NEAR Mainnet
Create/Fund Account:
Create via NEAR Wallet; fund with 20+ NEAR.

Build Reproducible WASM:
bash

docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/build.sh reproducible"

Deploy Single Contract:
bash

docker run -v $(pwd):/code --rm -e NETWORK=mainnet -e AUTH_ACCOUNT=auth.near onsocial-builder bash -c "./scripts/deploy.sh --contract auth-onsocial reproducible && ./scripts/deploy.sh init --contract auth-onsocial"

Verifying Deployments
Check State:
bash

near state auth.testnet
near view auth.testnet get_keys '{"account_id": "your-account.testnet", "limit": 10, "offset": 0}'

SourceScan:
Upload WASM and source to SourceScan.

Monitor Events:
Use NEAR Explorer for logs.

Troubleshooting
Build Failures: Verify Docker image, check Cargo.toml, ensure Cargo.lock is up-to-date.

Sandbox Issues:
bash

docker ps | grep near-sandbox
docker run -v $(pwd):/code --rm onsocial-builder bash -c "./scripts/sandbox.sh clean"

Deployment Errors: Check funds, credentials, node URL.

Docker Issues:
bash

docker system prune
docker build --no-cache -t onsocial-builder -f docker/Dockerfile.builder .

Best Practices
Reproducible Builds: Use ./scripts/build.sh reproducible for mainnet.

Secure Credentials: Store keys in .env or hardware wallet.

Test Thoroughly: Run ./scripts/test.sh and use sandbox_patch_state.

CI/CD: Configure GitHub Secrets for testnet deployments.

Backup Data: Save /root/.near before cleaning sandbox.

Version Control: Tag releases (e.g., v0.3.0) and use branches.

dApp Integration: Use ABIs with near-api-js.

