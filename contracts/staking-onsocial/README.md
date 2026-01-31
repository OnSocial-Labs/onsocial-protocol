# staking-onsocial

NEAR smart contract for SOCIAL token staking with Synthetix-style pro-rata reward distribution and API credits system.

## Features

- **Time-locked staking** — 1, 6, 12, 24, or 48 month lock periods with bonus multipliers
- **Pro-rata rewards** — Synthetix-style reward distribution based on effective stake
- **API credits** — Purchase credits with SOCIAL tokens (60% infra / 40% rewards split)
- **Daily free credits** — Configurable free credit allowance per user

### Lock Bonuses

| Lock Period | Bonus |
|-------------|-------|
| 1-6 months  | +10%  |
| 7-12 months | +20%  |
| 13-24 months| +35%  |
| 25-48 months| +50%  |

## Build

```bash
# From workspace root
make build-contract-staking-onsocial

# Or directly
cd contracts/staking-onsocial
cargo near build
```

## Usage

### Initialize

```bash
near call <contract> new '{"token_id":"social.near","owner_id":"owner.near","credits_per_token":1000,"free_daily_credits":100}' --accountId <deployer>
```

### Lock Tokens (via ft_transfer_call)

```bash
near call social.near ft_transfer_call '{"receiver_id":"<contract>","amount":"1000000000000000000000000","msg":"{\"action\":\"lock\",\"months\":12}"}' --accountId <user> --depositYocto 1
```

### Buy Credits

```bash
near call social.near ft_transfer_call '{"receiver_id":"<contract>","amount":"1000000000000000000000000","msg":"{\"action\":\"credits\"}"}' --accountId <user> --depositYocto 1
```

### Unlock & Claim

```bash
near call <contract> unlock --accountId <user> --gas 100Tgas
near call <contract> claim_rewards --accountId <user> --gas 100Tgas
```

## API Reference

### User Methods

| Method | Description |
|--------|-------------|
| `unlock()` | Withdraw tokens after lock expires |
| `claim_rewards()` | Claim accumulated staking rewards |

### View Methods

| Method | Description |
|--------|-------------|
| `get_account(account_id)` | Get account staking info |
| `get_pending_rewards(account_id)` | Calculate claimable rewards |
| `get_stats()` | Contract-wide statistics |
| `is_gateway(account_id)` | Check gateway authorization |

### Owner Methods

| Method | Description |
|--------|-------------|
| `update_contract()` | Deploy new contract code |
| `add_gateway(gateway_id)` | Authorize gateway to debit credits |
| `remove_gateway(gateway_id)` | Revoke gateway authorization |
| `withdraw_infra(amount, receiver_id)` | Withdraw from infra pool |
| `set_owner(new_owner)` | Transfer ownership |
| `set_credits_per_token(rate)` | Update credit exchange rate |
| `set_free_daily_credits(amount)` | Update daily free allowance |

#### Upgrade Contract

```bash
near call staking.onsocial.near update_contract --base64-file new.wasm --accountId owner.near --gas 100Tgas
```

### Gateway Methods

| Method | Description |
|--------|-------------|
| `debit_credits(account_id, amount)` | Debit credits from user account |

## Events

All events follow NEP-297 standard with `onsocial` namespace:

- `STAKE_LOCK` / `STAKE_UNLOCK`
- `CREDITS_PURCHASE` / `CREDITS_DEBIT`
- `REWARDS_CLAIM` / `SCHEDULED_FUND` / `SCHEDULED_RELEASE`
- `GATEWAY_ADDED` / `GATEWAY_REMOVED`
- `OWNER_CHANGED` / `PARAMS_UPDATED`
- `INFRA_WITHDRAW` / `CONTRACT_UPGRADE`

## License

See [LICENSE.md](../../LICENSE.md) in repository root.
