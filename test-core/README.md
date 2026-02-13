# test-core — Live Testnet Contract Testing

Interactive test scripts for the `core.onsocial.testnet` contract.
Tests all major flows: data, groups, voting, permissions — against the live deployed contract.

## Setup

```bash
pip install pynacl base58
```

## Usage

```bash
# Run all tests sequentially
python3 test-core/run_all.py

# Run a specific test suite
python3 test-core/run_all.py --suite groups
python3 test-core/run_all.py --suite voting
python3 test-core/run_all.py --suite permissions
python3 test-core/run_all.py --suite data

# Use custom account
ACCOUNT_ID=myaccount.testnet CREDS_FILE=~/.near-credentials/testnet/myaccount.testnet.json python3 test-core/run_all.py
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_URL` | `https://api.onsocial.id` | Gateway base URL |
| `ACCOUNT_ID` | `test01.onsocial.testnet` | NEAR account to test with |
| `CONTRACT_ID` | `core.onsocial.testnet` | Core contract |
| `CREDS_FILE` | `~/.near-credentials/testnet/<ACCOUNT_ID>.json` | Keypair file |

## Test Suites

- **data** — Set/get key-value data, storage operations
- **groups** — Create group, join, leave, add/remove members, privacy, transfer ownership
- **voting** — Create proposals, vote, check tally, cancel
- **permissions** — Grant/revoke permissions, key permissions, group admin checks
