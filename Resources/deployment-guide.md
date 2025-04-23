# Deployment Guide

This guide outlines how to deploy the `auth-onsocial`, `ft-wrapper-onsocial`, and `relayer-onsocial` smart contracts from the OnSocial Labs monorepo to a local NEAR Sandbox environment, NEAR testnet, or mainnet. The contracts are built using Rust and the NEAR SDK, with `cargo-near` (v0.13.6) for building and deployment.

## Table of Contents
- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Quickstart: Interacting with Contracts](#quickstart-interacting-with-contracts)
- [Building the Contracts](#building-the-contracts)
- [Deploying to NEAR Sandbox](#deploying-to-near-sandbox)
- [Deploying to NEAR Testnet](#deploying-to-near-testnet)
- [Deploying to NEAR Mainnet](#deploying-to-near-mainnet)
- [Verifying Deployments](#verifying-deployments)
- [Troubleshooting](#troubleshooting)
- [Best Practices](#best-practices)

## Overview
The monorepo contains three NEAR smart contracts:
- **auth-onsocial**: Manages public key authentication with single and multi-signature support.
- **ft-wrapper-onsocial**: Handles fungible token (FT) transfers, storage management, and cross-chain bridging.
- **relayer-onsocial**: Facilitates meta-transactions, account sponsoring, and cross-chain operations.

Deployment involves:
- Building WebAssembly (WASM) files using `cargo-near`.
- Deploying to a NEAR blockchain (Sandbox, testnet, or mainnet) using `near-cli` or `cargo-near deploy`.
- Initializing the contracts with appropriate parameters.

The deployment scripts (`scripts/build.sh`, `scripts/deploy.sh`, `scripts/sandbox.sh`) streamline the process, and Docker support ensures consistent environments.

## Prerequisites
Before deploying, ensure you have the following:
### Hardware
- A computer with at least 4GB RAM and 10GB free disk space.
- Supported OS: Linux (Ubuntu/Debian), macOS, or Windows (via WSL2).

### Software
- **Rust (version 1.80.0)**:
  ```bash
  rustup install 1.80.0
  rustup target add wasm32-unknown-unknown

cargo-near (v0.13.6):
bash

cargo install cargo-near --version 0.13.6

near-cli:
bash

npm install -g near-cli

near-sandbox:
bash

npm install -g near-sandbox

Docker and Docker Compose (optional, for containerized builds):
bash

docker --version
docker-compose --version

Git:
bash

git --version

NEAR Accounts:
For testnet/mainnet: A NEAR account with sufficient funds (create via NEAR Wallet or cargo near create-dev-account).

For sandbox: No account creation is needed; use the default test.near account.

Repository:
Clone the monorepo:
bash

git clone https://github.com/OnSocial-Labs/onsocial-contracts.git
cd onsocial-contracts

Setup
Verify Directory Structure:
Ensure the monorepo has the following structure:

onsocial-contracts/
├── contracts/
│   ├── auth-onsocial/
│   ├── ft-wrapper-onsocial/
│   ├── relayer-onsocial/
├── scripts/
│   ├── build.sh
│   ├── deploy.sh
│   ├── test.sh
│   ├── abi.sh
│   ├── sandbox.sh
├── docker/
│   ├── Dockerfile.builder
│   ├── docker-compose.yml
├── Resources/
│   ├── README.md
│   ├── deployment-guide.md
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
├── Cargo.toml
├── README.md
├── .gitignore

Install Dependencies:
Run the installation commands listed in Prerequisites (#prerequisites).

Configure Environment:
For testnet/mainnet, set up near-cli credentials:
bash

near login

For sandbox, no additional configuration is needed.

Optionally, create a .env file for sensitive data (e.g., account IDs):
bash

echo "MASTER_ACCOUNT=your-account.testnet" > .env

Update scripts/deploy.sh to source .env if needed.

Building the Contracts
Build the contracts to generate WASM files and ABIs.
Build WASM Files:
For local development (non-reproducible builds):
bash

./scripts/build.sh

For production (reproducible builds):
bash

./scripts/build.sh reproducible

Output WASM files are located in:
contracts/auth-onsocial/target/wasm32-unknown-unknown/release/auth_onsocial.wasm

contracts/ft-wrapper-onsocial/target/wasm32-unknown-unknown/release/ft_wrapper_onsocial.wasm

contracts/relayer-onsocial/target/wasm32-unknown-unknown/release/relayer_onsocial.wasm

Generate ABIs:
Generate ABI schemas for frontend integration:
bash

./scripts/abi.sh

ABIs are saved in each contract's directory (e.g., contracts/auth-onsocial/abi.json).

Run Tests:
Verify contract functionality:
bash

./scripts/test.sh

Use Docker (Optional):
Build and run contracts in a containerized environment:
bash

docker-compose up

This automatically runs ./scripts/build.sh.

Deploying to NEAR Sandbox
NEAR Sandbox is ideal for local testing and development.
Start NEAR Sandbox:
bash

./scripts/sandbox.sh init
./scripts/sandbox.sh run

The sandbox runs on http://localhost:3030.

Data is stored in /tmp/near-sandbox.

Deploy Contracts:
Deploy to the sandbox:
bash

./scripts/deploy.sh

Initialize contracts:
bash

./scripts/deploy.sh init

Contracts are deployed as auth.sandbox, ft-wrapper.sandbox, and relayer.sandbox under the test.near account.

Test Interactions:
Call a contract method (e.g., register a key):
bash

near call auth.sandbox register_key '{"account_id": "test.near", "public_key": "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU", "expiration_days": null, "is_multi_sig": false, "multi_sig_threshold": null}' --accountId test.near --nodeUrl http://localhost:3030 --keyPath /tmp/near-sandbox/validator_key.json

Use sandbox_patch_state for state manipulation (e.g., via near-api-js):
javascript

const nearApi = require('near-api-js');
const { connect } = nearApi;

async function patchState() {
  const config = {
    networkId: 'sandbox',
    nodeUrl: 'http://localhost:3030',
    keyPath: '/tmp/near-sandbox/validator_key.json',
  };
  const near = await connect(config);
  const response = await near.connection.provider.sendJsonRpc('sandbox_patch_state', [{
    contract_id: 'auth.sandbox',
    key: Buffer.from('state').toString('base64'),
    value: Buffer.from('new_state').toString('base64'),
  }]);
  console.log(response);
}

patchState();

Clean Up:
bash

./scripts/sandbox.sh stop
./scripts/sandbox.sh clean

Deploying to NEAR Testnet
Testnet is suitable for public testing and staging.
Create/Fund Accounts:
Create a testnet account:
bash

cargo near create-dev-account

Fund the account via the NEAR Testnet Faucet or transfer NEAR tokens.

Configure deploy.sh:
Edit scripts/deploy.sh:
bash

NETWORK="testnet"
MASTER_ACCOUNT="your-account.testnet"

Ensure your account has at least 10 NEAR for deployment and storage costs.

Build and Deploy:
Build non-reproducible WASM files:
bash

./scripts/build.sh

Deploy to testnet:
bash

./scripts/deploy.sh
./scripts/deploy.sh init

Contracts are deployed as auth.testnet, ft-wrapper.testnet, and relayer.testnet.

Verify Deployment:
Check contract state:
bash

near state auth.testnet

Deploying to NEAR Mainnet
Mainnet is for production deployments.
Create/Fund Accounts:
Create a mainnet account via NEAR Wallet.

Fund the account with sufficient NEAR (at least 20 NEAR recommended).

Configure deploy.sh:
Edit scripts/deploy.sh:
bash

NETWORK="mainnet"
MASTER_ACCOUNT="your-account.near"

Build Reproducible WASM Files:
Ensure Cargo.lock is committed and the repository is pushed:
bash

git add Cargo.lock
git commit -m "Add Cargo.lock for reproducible builds"
git push origin main

Build reproducible WASM files:
bash

./scripts/build.sh reproducible

Deploy to Mainnet:
Deploy with reproducible builds:
bash

./scripts/deploy.sh reproducible
./scripts/deploy.sh init

Contracts are deployed as auth.near, ft-wrapper.near, and relayer.near.

Secure Credentials:
Store private keys securely (e.g., in a hardware wallet).

Use environment variables or a key store instead of hardcoding credentials.

Verifying Deployments
Check Contract State:
Use near-cli to verify contract deployment:
bash

near state auth.testnet
near view auth.testnet get_keys '{"account_id": "your-account.testnet", "limit": 10, "offset": 0}'

SourceScan Verification:
For mainnet/testnet, verify reproducible builds on SourceScan:
Upload the WASM files and source code from https://github.com/OnSocial-Labs/onsocial-contracts.

Ensure the repository is public or accessible for verification.

Monitor Events:
Check contract logs for events (e.g., AuthEvent, FtWrapperEvent, RelayerEvent) using NEAR Explorer or custom logging.

Troubleshooting
Build Failures:
Ensure Rust 1.80.0 and cargo-near 0.13.6 are installed.

Check for missing dependencies in Cargo.toml.

Run ./scripts/build.sh clean and retry.

Sandbox Issues:
If near-sandbox fails to start, verify port 3030 is free:
bash

lsof -i :3030

Clean sandbox data:
bash

./scripts/sandbox.sh clean

Deployment Errors:
Insufficient balance: Fund the account with more NEAR.

Invalid credentials: Run near login or check key path.

Network issues: Verify node URL (e.g., https://rpc.testnet.near.org for testnet).

Docker Issues:
Rebuild images if outdated:
bash

docker-compose build

Contact Support:
For issues, open a GitHub Issue at https://github.com/OnSocial-Labs/onsocial-contracts or join the NEAR Discord.

Best Practices
Use Reproducible Builds for Production:
Always use ./scripts/build.sh reproducible for mainnet to ensure deterministic WASM files verifiable on SourceScan.

Test Thoroughly:
Run ./scripts/test.sh before deployment.

Use NEAR Sandbox with sandbox_patch_state to simulate edge cases.

Secure Deployments:
Use a dedicated deployment account with limited funds.

Store private keys in a secure key store or hardware wallet.

Automate with CI/CD:
The .github/workflows/ci.yml automates builds, tests, and deployments. Configure GitHub Secrets (NEAR_MASTER_ACCOUNT, NEAR_PRIVATE_KEY) for automated testnet deployments.

Backup Sandbox Data:
If testing requires persistent data, back up /tmp/near-sandbox before running ./scripts/sandbox.sh clean.

Monitor Gas and Fees:
Adjust cross_contract_gas and base_fee in contract configurations to optimize performance.

Monitor LowBalance events to ensure sufficient contract funds.

Version Control:
Tag releases in Git (e.g., v0.1.0) for each deployment.

Use branches for development and merge via pull requests.

Integrate with dApps:
Use generated ABIs for frontend integration with near-api-js.

Test cross-chain functionality in ft-wrapper-onsocial with mock MPC signatures before mainnet deployment.

