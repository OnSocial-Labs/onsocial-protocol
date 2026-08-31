# token-onsocial

NEP-141/145/148 compliant fungible token for the OnSocial protocol. Fixed 18 decimals.

## Features

- **NEP-141**: Token transfers with `ft_transfer` and `ft_transfer_call`
- **NEP-145**: Storage management for account registration
- **NEP-148**: Token metadata (name, symbol, icon, decimals)
- **Burnable**: Token holders can burn their own tokens
- **Owner controls**: Update icon, metadata reference, transfer/renounce ownership

## Build

```bash
make build-contract-token-onsocial
```

## Test

```bash
# Unit tests
make test-unit-contract-token-onsocial

# Integration tests
make test-integration-contract-token-onsocial
```

## Deploy

```bash
near deploy <account> ./target/near/token_onsocial/token_onsocial.wasm
```

## Publish as the creator-token template (app Create token)

The app's Create-token flow deploys user FTs with `UseGlobalContract` — no
per-user WASM upload. Ops publishes this crate as a **global contract** once
per network, then points the app at the code hash.

```bash
# Build + publish (immutable hash mode) and print the env line:
scripts/publish-ft-template.sh --account you.testnet --network testnet
scripts/publish-ft-template.sh --account you.near --network mainnet
```

Then set in `packages/onsocial-app` env (`.env.local` / Vercel):

```bash
NEXT_PUBLIC_FT_TEMPLATE_CODE_HASH=<printed hash>
```

Rebuild the app; `/api/ft-template` should report `ready` and the Create
button enables. Mint a throwaway token on testnet before announcing.

Notes:

- Hash mode is immutable — a new contract release means a new publish + new
  hash. `NEXT_PUBLIC_FT_TEMPLATE_GLOBAL_ACCOUNT` (mutable account mode) exists
  for staging only.
- The protocol SOCIAL deploy (`token.<network>`) is a normal deploy of this
  same crate — it is not the creator template until published as global.

## Initialize

```bash
near call <contract> new '{
  "owner_id": "owner.near",
  "name": "OnSocial Token",
  "symbol": "SOCIAL",
  "total_supply": "1000000000000000000000000000",
  "icon": "data:image/svg+xml,..."
}' --accountId <deployer>
```

**Parameters:**

- `owner_id` - Account receiving initial supply and admin rights
- `name` - Token display name (required, non-empty)
- `symbol` - Token ticker symbol (required, non-empty)
- `total_supply` - Initial supply in smallest units (required, > 0)
- `icon` - Data URL for token icon (required, non-empty)

## API

### View Methods

| Method                           | Description                  |
| -------------------------------- | ---------------------------- |
| `ft_total_supply()`              | Total token supply           |
| `ft_balance_of(account_id)`      | Account balance              |
| `ft_metadata()`                  | Token metadata               |
| `get_owner()`                    | Current owner account        |
| `version()`                      | Contract version             |
| `storage_balance_of(account_id)` | Account storage deposit      |
| `storage_balance_bounds()`       | Min/max storage requirements |

### Change Methods

| Method                                             | Description                       |
| -------------------------------------------------- | --------------------------------- |
| `ft_transfer(receiver_id, amount, memo)`           | Transfer tokens (1 yocto)         |
| `ft_transfer_call(receiver_id, amount, memo, msg)` | Transfer with callback (1 yocto)  |
| `storage_deposit(account_id, registration_only)`   | Register account                  |
| `storage_withdraw(amount)`                         | Withdraw excess storage           |
| `storage_unregister(force)`                        | Unregister account                |
| `burn(amount)`                                     | Burn tokens from caller (1 yocto) |

### Owner Methods

| Method                                     | Description                    |
| ------------------------------------------ | ------------------------------ |
| `set_icon(icon)`                           | Update token icon              |
| `set_reference(reference, reference_hash)` | Update metadata reference      |
| `set_owner(new_owner)`                     | Transfer ownership             |
| `renounce_owner()`                         | Permanently renounce ownership |

## Examples

### Transfer Tokens

```bash
# Register recipient first
near call <contract> storage_deposit '{"account_id": "recipient.near"}' \
  --accountId sender.near --deposit 0.00125

# Transfer
near call <contract> ft_transfer '{
  "receiver_id": "recipient.near",
  "amount": "1000000000000000000"
}' --accountId sender.near --depositYocto 1
```

### Check Balance

```bash
near view <contract> ft_balance_of '{"account_id": "user.near"}'
```

### Burn Tokens

```bash
near call <contract> burn '{"amount": "1000000000000000000"}' \
  --accountId holder.near --depositYocto 1
```

## Token Amounts

All amounts use 18 decimals:

| Display    | Raw Amount            |
| ---------- | --------------------- |
| 1 token    | `1000000000000000000` |
| 0.1 token  | `100000000000000000`  |
| 0.01 token | `10000000000000000`   |

## License

MIT
