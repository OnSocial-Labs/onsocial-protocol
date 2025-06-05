<!--
README.md for relayer-onsocial contract
-->
# Relayer OnSocial Contract

The `relayer-onsocial` contract is a core component of the OnSocial Protocol, enabling gasless transactions and secure relayer operations on the NEAR blockchain.

## Overview

- **Testnet Deployment**: `relayer.onsocial.testnet`
- **Mainnet Target**: `relayer.onsocial.near` (January 2026)
- **Language**: Rust
- **Framework**: `near-sdk` (v5.14.0)

## Features

### Transaction Sponsorship
- Sponsors NEAR actions (`FunctionCall`, `Transfer`, `AddKey`, `CreateAccount`, `Stake`) by covering gas (up to 300 TGas) and deposits.
- **Authorization**:
  - Accounts with manager or platform key can sponsor transactions.
  - Supports developer-sponsored user transactions via `proxy_for`.
- **Gas Management**: Dynamically allocates gas, ensuring efficient usage and refunds.
- **Nonce Protection**: Prevents replay attacks using per-account nonces.

### Input Validation
- Ensures valid action lists, deposits, and `AccountId` lengths (1–64 characters).
- Validates gas usage within defined thresholds.
- Verifies signatures for non-manager or non-platform key calls.

### Balance Management
- Maintains `min_balance` (default: 5 NEAR) and offloads excess funds securely.
- Accepts deposits and emits NEP-297 events for transparency and debugging.

### Security Enforcement
- Restricts admin actions to the manager.
- Updates nonces to prevent reentrancy.
- Configurable events ensure auditable actions.

### Manager & Platform Key Management
- Stores `manager: AccountId` and `platform_public_key: PublicKey`.
- Allows secure updates to manager and platform key.

### State Management
- Stores contract settings, including version, manager, and gas limits.
- Supports state upgrades with version tracking and migration.

## Key Responsibilities

- **Transaction Sponsorship**: Sponsors NEAR actions by covering gas and deposits, with optional proxy support for developer-sponsored transactions.
- **Input Validation**: Validates actions, gas limits, and signatures to ensure secure and efficient operations.
- **Balance Management**: Maintains thresholds for relayer funds and offloads excess deposits to a designated recipient.
- **Security Enforcement**: Implements strict access control and authentication mechanisms.
- **Manager and Platform Key Management**: Supports secure updates to manager and platform key.
- **State Management**: Tracks state versions and supports migrations.

## Key Methods

- **`new`**: Initializes the contract with default settings.
- **`sponsor_transactions`**: Validates and sponsors transactions.
- **`handle_result`**: Executes actions, updates nonces, and logs gas usage.
- **`deposit`**: Handles deposits and offloads excess funds.
- **`set_manager` / `set_platform_public_key`**: Updates manager or platform key details.
- **`update_contract`**: Deploys new code and migrates state.
- **`get_*`**: Provides view methods for contract state.

## File Structure & Documentation

Each Rust module in `src/` is documented inline:
- **admin.rs**: Admin and access control logic (manager, balance, platform key, pause, refunds).
- **balance.rs**: Deposit logic and event emission.
- **constants.rs**: Shared constants for balances, gas, and limits.
- **errors.rs**: Error types and codes for contract logic.
- **events.rs**: Event emission for all contract actions.
- **lib.rs**: Main contract logic and NEAR interface.
- **sponsor.rs**: Sponsorship and transaction execution logic.
- **state.rs**: State struct, nonce/refund management, reentrancy guards.
- **state_versions.rs**: State versioning and migration logic.
- **types.rs**: Core types for actions, delegate actions, and keys.

---

- **Cost**: ~0.42 TGas per `CreateAccount`, funded by the relayer’s balance.