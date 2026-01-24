# Substreams Tests

Test suite for the OnSocial Substreams indexer (PostgreSQL + Hasura).

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

### Individual Test Files

```bash
# DATA_UPDATE tests
./test_data.sh query         # Query existing data
./test_data.sh write         # Write tests (set, remove, refs)
./test_data.sh validate      # Validate schema

# STORAGE_UPDATE tests
./test_storage.sh query      # Query storage updates
./test_storage.sh write      # Test auto_deposit, deposit

# PERMISSION_UPDATE tests
./test_permission.sh query   # Query permissions
./test_permission.sh write   # Test grant, revoke, key operations

# GROUP_UPDATE tests
./test_group.sh query        # Query groups
./test_group.sh write        # Test create, members, proposals

# CONTRACT_UPDATE tests
./test_contract.sh query     # Query contract updates
./test_contract.sh write     # Test meta_tx tracking

# Health tests
./test_health.sh             # Test Hasura connectivity
```

### Coverage Report

```bash
./coverage_report.sh         # Show operation coverage
```

### Run All Tests

```bash
./run_all.sh                 # Run all query tests
./run_all.sh write          # Run all write tests
```

## Test Features

- ✅ **Smart Waiting** - Polls indexer until block is synced (no arbitrary delays)
- ✅ **Full Field Validation** - Validates all schema fields
- ✅ **Block Extraction** - Extracts block height from EVENT_JSON
- ✅ **Assertions Tracking** - Counts passed/failed assertions
- ✅ **Formatted Output** - Color-coded results matching subgraph tests

## Security

- Never commit `.env` files
- Use `.env.example` for documentation
- The `HASURA_ADMIN_SECRET` is required and has no default
