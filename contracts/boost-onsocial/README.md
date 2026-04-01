# boost-onsocial

NEAR smart contract for SOCIAL token boost locking with time-based reward release, stepped weekly emission rates, and boost-seconds accounting.

## Overview

`boost-onsocial` lets users lock SOCIAL for fixed periods and receive a boosted share of a scheduled reward pool. Rewards are not split by raw deposit alone. They are split by accumulated `boost_seconds`, which combines:

- tier-weighted locked amount
- lock-duration bonus
- time spent active in the pool

The default release schedule starts at `0.01%` per week, increases by `0.01%` every 2 months, and caps at `0.20%` per week.

## Features

- Fixed lock periods: `1`, `6`, `12`, `24`, `48` months
- Tiered amount weighting to soften whale dominance
- Lock bonuses applied to weighted boost, not raw token principal
- Boost-seconds reward accounting for fair time-weighted distribution
- Stepped reward release schedule with configurable start, step, interval, and cap
- Reward clock pauses when there are no active participants
- Auto-registration subsidy for first lock when contract storage balance allows it
- Additional funding paths:
	- `credits`: splits inbound SOCIAL into `60% infra` and `40% scheduled rewards`
	- `fund_scheduled`: adds SOCIAL directly to the scheduled reward pool

## Lock Bonuses

| Lock Period | Bonus |
|-------------|-------|
| 1 month     | +5%   |
| 6 months    | +10%  |
| 12 months   | +20%  |
| 24 months   | +35%  |
| 48 months   | +50%  |

Minimum lock amount: `0.01 SOCIAL`

## Reward Model

Rewards are distributed using:

```text
(user_boost_seconds / total_boost_seconds) * total_released - rewards_claimed
```

Where:

- `weighted_amount = 100% of first 1,000 SOCIAL + 50% of next 4,000 + 25% above 5,000`
- `effective_boost = weighted_amount * (100 + bonus) / 100`
- `boost_seconds` accumulates over time while the position remains active
- released rewards come from the scheduled pool according to the current weekly rate

Examples before lock bonus:

- `100 SOCIAL -> 100 weighted`
- `1,000 SOCIAL -> 1,000 weighted`
- `3,000 SOCIAL -> 2,000 weighted`
- `10,000 SOCIAL -> 4,250 weighted`

## Build

```bash
# From workspace root
make build-contract-boost-onsocial

# Or directly
cd contracts/boost-onsocial
cargo near build non-reproducible-wasm
```

## Initialization

### Default Schedule

```bash
near call <contract> new '{"token_id":"token.onsocial.near","owner_id":"owner.near"}' --accountId <deployer>
```

### Custom Schedule

```bash
near call <contract> new_with_schedule '{
	"config": {
		"token_id": "token.onsocial.near",
		"owner_id": "owner.near",
		"release_schedule_start_ns": 1711929600000000000,
		"initial_weekly_rate_bps": 1,
		"rate_step_bps": 1,
		"rate_step_interval_months": 2,
		"max_weekly_rate_bps": 20
	}
}' --accountId <deployer>
```

## Usage

### Register Storage

Manual registration is supported:

```bash
near call <contract> storage_deposit '{}' --accountId <user> --deposit 0.005
```

The first lock can also auto-register the account if the contract still has storage subsidy available.

### Lock SOCIAL

```bash
near call token.onsocial.near ft_transfer_call '{"receiver_id":"<contract>","amount":"1000000000000000000","msg":"{\"action\":\"lock\",\"months\":12}"}' --accountId <user> --depositYocto 1
```

### Extend or Renew a Lock

```bash
near call <contract> extend_lock '{"months":24}' --accountId <user>
near call <contract> renew_lock '{}' --accountId <user>
```

`extend_lock` resets the unlock date from the current block timestamp using the new period.

### Unlock After Expiry

```bash
near call <contract> unlock '{}' --accountId <user> --gas 100Tgas
```

### Claim Rewards

```bash
near call <contract> claim_rewards '{}' --accountId <user> --gas 100Tgas
```

### Add Reward Funding

Directly add SOCIAL to the scheduled reward pool:

```bash
near call token.onsocial.near ft_transfer_call '{"receiver_id":"<contract>","amount":"1000000000000000000000","msg":"{\"action\":\"fund_scheduled\"}"}' --accountId <owner> --depositYocto 1
```

Or route SOCIAL through the credits split:

```bash
near call token.onsocial.near ft_transfer_call '{"receiver_id":"<contract>","amount":"1000000000000000000000","msg":"{\"action\":\"credits\"}"}' --accountId <user> --depositYocto 1
```

## API Reference

### User Methods

| Method | Description |
|--------|-------------|
| `storage_deposit(account_id?, registration_only?)` | Registers storage with fixed-cost deposit |
| `extend_lock(months)` | Extends an existing lock to a longer supported period |
| `renew_lock()` | Re-locks using the current lock period |
| `unlock()` | Unlocks tokens after expiry |
| `claim_rewards()` | Claims accumulated SOCIAL rewards |

### View Methods

| Method | Description |
|--------|-------------|
| `storage_balance_bounds()` | Returns NEP-145 storage min/max |
| `storage_balance_of(account_id)` | Returns storage registration status |
| `get_account(account_id)` | Returns account lock, effective boost, rewards, and boost-seconds |
| `get_stats()` | Returns contract-wide totals and projected release stats |
| `get_lock_status(account_id)` | Returns lock expiry, unlockability, and bonus details |
| `get_reward_rate(account_id)` | Returns projected claimable rewards and per-second accrual info |
| `get_storage_subsidy_available()` | Returns how many more users can be auto-registered |

### Owner Methods

| Method | Description |
|--------|-------------|
| `withdraw_infra(amount, receiver_id)` | Withdraws from the infra pool |
| `set_owner(new_owner)` | Transfers ownership |
| `update_contract()` | Upgrades using supplied wasm bytes |
| `update_contract_from_hash(code_hash)` | Upgrades using a global contract hash |
| `poke()` | Forces reward release and global boost-seconds sync |

## Key View Structures

`get_account(account_id)` returns:

- `locked_amount`
- `unlock_at`
- `lock_months`
- `effective_boost`
- `claimable_rewards`
- `boost_seconds`
- `rewards_claimed`

`get_stats()` returns:

- `total_locked`
- `total_effective_boost`
- `total_boost_seconds`
- `total_rewards_released`
- `scheduled_pool`
- `infra_pool`
- `active_weekly_rate_bps`
- release schedule configuration fields

## Events

All events follow NEP-297 with standard `onsocial` and version `1.0.0`.

Primary events emitted by this contract include:

- `STORAGE_DEPOSIT`
- `BOOST_LOCK`
- `BOOST_EXTEND`
- `BOOST_UNLOCK`
- `UNLOCK_FAILED`
- `REWARDS_RELEASED`
- `REWARDS_CLAIM`
- `CLAIM_FAILED`
- `CREDITS_PURCHASE`
- `SCHEDULED_FUND`
- `INFRA_WITHDRAW`
- `WITHDRAW_INFRA_FAILED`
- `OWNER_CHANGED`
- `CONTRACT_UPGRADE`

## License

See [LICENSE.md](../../LICENSE.md) in the repository root.
