# Substreams Tests

Test suite for the OnSocial Substreams indexer (PostgreSQL + Hasura).

## Directory Structure

```
tests/
  common.sh              # Shared helpers (env, queries, assertions)
  run_all.sh             # Runner for all contracts
  test_health.sh         # Cross-contract health & schema checks
  coverage_report.sh     # Operation coverage across all contracts

  core/                  # Core contract (onsocial NEP-297)
    test_data.sh         # DATA_UPDATE events
    test_storage.sh      # STORAGE_UPDATE events
    test_group.sh        # GROUP_UPDATE events
    test_contract.sh     # CONTRACT_UPDATE events
    test_permission.sh   # PERMISSION_UPDATE events

  staking/               # Staking contract
    test_staking_events.sh    # Staking event types
    test_staker_state.sh      # Staker state view
    test_credit_purchases.sh  # Credit purchase history

  token/                 # Token contract (NEP-141)
    test_token_events.sh      # ft_mint, ft_burn, ft_transfer
    test_token_balances.sh    # Token balance tracking
```

## Setup

1. **Environment Variables** - Set these in the root `.env` file or export them:
   ```bash
   export HASURA_URL="http://135.181.110.183:8080"
   export HASURA_ADMIN_SECRET="your_admin_secret_here"
   export CONTRACT="core.onsocial.testnet"
   export SIGNER="onsocial.testnet"
   export NETWORK="testnet"
   ```

2. **Load Environment** (from project root):
   ```bash
   source .env
   ```

## Running Tests

All test files support three modes:
- `query` - Read-only tests (default, safe)
- `write` - Tests that write to contract
- `all` - Run all tests

### Run All Tests

```bash
./run_all.sh                         # All contracts, query mode
./run_all.sh query core              # Core contract only
./run_all.sh query 'core staking'    # Core + staking
./run_all.sh all                     # Full suite, all contracts
```

### Individual Test Files

```bash
# Core contract tests
./core/test_data.sh query
./core/test_storage.sh query
./core/test_group.sh query
./core/test_contract.sh query
./core/test_permission.sh query

# Staking contract tests
./staking/test_staking_events.sh query
./staking/test_staker_state.sh query
./staking/test_credit_purchases.sh query

# Token contract tests
./token/test_token_events.sh query
./token/test_token_balances.sh query

# Cross-contract
./test_health.sh
./coverage_report.sh
```

### Coverage Report

```bash
./coverage_report.sh         # Show operation coverage across all contracts
```

## Test Features

- **Smart Waiting** - Polls indexer until block is synced (no arbitrary delays)
- **Full Field Validation** - Validates all schema fields
- **Block Extraction** - Extracts block height from EVENT_JSON
- **Assertions Tracking** - Counts passed/failed assertions
- **Formatted Output** - Color-coded results matching subgraph tests

## Security

- Never commit `.env` files
- Use `.env.example` for documentation
- The `HASURA_ADMIN_SECRET` is required and has no default
