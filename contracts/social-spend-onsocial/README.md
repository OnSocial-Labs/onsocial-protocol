# social-spend-onsocial

Reusable SOCIAL spend contract for OnSocial social actions. Accepts SOCIAL via `ft_transfer_call`, validates a versioned message envelope against an owner-controlled action registry, routes funds into treasury, season pools, and target balances, then emits canonical events for indexers and apps.

Token rules stay on-chain; game and product semantics stay event-driven off-chain.

## Standards

| Standard | Version | Purpose |
|----------|---------|---------|
| NEP-141  | —       | SOCIAL `ft_transfer_call` inbound spends |
| NEP-297  | 1.0.0   | Event standard (`onsocial` prefix) |

## Features

- **Registry-driven actions** — Owner configures action slugs, min amounts, allowed target types, and treasury / season / target / burn / boost credits routing in basis points
- **Default social actions** — `signal_profile`, `boost_post`, `endorse_profile`, `join_rally`, `support_profile` installed at `new`
- **Season pools** — Time-bounded seasons with optional Merkle settlement and per-account claims
- **Target balances** — Routed SOCIAL accrues on recipient accounts; recipients claim via `claim_target_balance`
- **Treasury routing** — Configurable treasury account; owner or treasury may withdraw accrued balance
- **Boost credits routing** — Optional `boost_contract_id`; when set, `treasury_bps` on every action routes to boost via `ft_transfer_call` + `{"action":"credits"}` (60% infra / 40% rewards on boost) instead of accruing for treasury withdrawal
- **Async payouts** — Claims and treasury withdrawals use `ft_transfer` promises with rollback on failure
- **Pause switch** — Owner can halt spends and user claims while admin paths remain available
- **Settlement publisher** — Optional dedicated account (or relayer service) to publish season Merkle roots after season end

## Build

```bash
make build-contract-social-spend-onsocial
```

## Test

```bash
# Unit tests
make test-unit-contract-social-spend-onsocial

# Integration tests (requires sandbox + mock-ft)
make test-integration-contract-social-spend-onsocial
```

## Deploy

```bash
near deploy <account> ./target/near/social_spend_onsocial/social_spend_onsocial.wasm
```

## Initialize

```bash
near call <contract> new '{
  "owner_id": "owner.near",
  "social_token": "token.onsocial.near",
  "treasury_id": "treasury.near",
  "boost_contract_id": "boost.onsocial.near"
}' --accountId <deployer>
```

Default deploy config (`configs/contracts.json`) uses `social-spend.${AUTH_ACCOUNT}` with `social_token`, `treasury_id`, and `boost_contract_id` set to `token.${AUTH_ACCOUNT}`, `${AUTH_ACCOUNT}`, and `boost.${AUTH_ACCOUNT}` respectively. On upgrade, `migrate()` reads the current contract state and bumps the version string.

## Architecture

Spends do not use a generic `execute()` entry point. Users send SOCIAL through the token contract:

```
token.ft_transfer_call(receiver_id=social-spend, amount, msg=SpendMsg JSON)
  -> social-spend.ft_on_transfer(sender_id, amount, msg)
```

The contract only accepts transfers from `social_token`. It returns `0` unused tokens (full amount is consumed on success).

Outbound SOCIAL (target claims, season rewards, treasury withdrawals) uses an internal `ft_transfer` promise chain with `on_transfer_callback` rollback on failure. Only one pending outbound transfer per beneficiary account is allowed at a time.

### Caller resolution

| Path | Effective actor |
|------|-----------------|
| `ft_on_transfer` | `sender_id` (spender); `predecessor_account_id` must be `social_token` |
| `claim_target_balance`, `claim_season_reward` | `env::predecessor_account_id()` |
| Owner / treasury / settlement admin methods | `env::predecessor_account_id()` |

SOCIAL spends and claims are direct wallet calls on the token or spend contract (not routed through core `execute` or NEP-366 delegate actions). Season root publication may be sent via the OnSocial relayer private settlement endpoint.

## Spend message (`SpendMsg`)

Supported version: `v: 1` only.

```json
{
  "v": 1,
  "app_id": "portal",
  "action": "signal_profile",
  "target_type": "profile",
  "target_id": "alice.near",
  "season_id": "season-zero",
  "tag": "optional-tag",
  "recipient_id": "bob.near",
  "metadata": { "source": "feed" }
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `v` | yes | Must be `1` |
| `app_id` | yes | 1–64 byte slug (`[a-zA-Z0-9._-]`) |
| `action` | yes | Must match a configured action slug |
| `target_type` | yes | Must be listed on the action config |
| `target_id` | yes | Max 256 bytes; for `profile` targets with target routing, may be a NEAR account id |
| `season_id` | conditional | Required when action has `season_pool_bps > 0` or `season_required` |
| `tag` | no | Max 32 bytes |
| `recipient_id` | conditional | Required for non-`profile` target types when `target_bps > 0`; optional for `profile` (defaults to `target_id`) |
| `metadata` | no | JSON object, max 1,024 bytes serialized |

Example spend via token (attach 1 yoctoNEAR on `ft_transfer_call` per NEP-141):

```bash
near call token.onsocial.near ft_transfer_call '{
  "receiver_id": "social-spend.onsocial.near",
  "amount": "100000000000000000",
  "msg": "{\"v\":1,\"app_id\":\"portal\",\"action\":\"signal_profile\",\"target_type\":\"profile\",\"target_id\":\"bob.near\"}"
}' --accountId alice.near --depositYocto 1
```

## Default actions

Installed at initialization. Routing bps always sum to `10_000`.

| Action | Target types | Treasury | Season pool | Target | Season required | Self target |
|--------|--------------|----------|-------------|--------|-----------------|-------------|
| `signal_profile` | `profile` | 1,000 | 0 | 9,000 | no | no |
| `boost_post` | `post` | 1,000 | 0 | 9,000 | no | yes |
| `endorse_profile` | `profile` | 1,000 | 0 | 9,000 | no | no |
| `join_rally` | `rally` | 500 | 9,500 | 0 | yes | yes |
| `support_profile` | `profile` | 500 | 0 | 9,500 | no | no |

Minimum spend per action: `0.01 SOCIAL` (`10^16` yocto, 18 decimals).

## API

### Spend entry point

| Method | Description |
|--------|-------------|
| `ft_on_transfer(sender_id, amount, msg)` | Process a SOCIAL spend; `msg` is JSON `SpendMsg` |

### User claims

| Method | Deposit | Description |
|--------|---------|-------------|
| `claim_target_balance(amount?)` | 0 | Withdraw accrued target balance to caller; `amount` defaults to full balance |
| `claim_season_reward(season_id, amount, proof)` | 0 | Claim SOCIAL from a published season Merkle root |

Season leaf hash: `sha256("onsocial-season-v1:{season_id}:{account_id}:{amount}")`. Proofs use sorted-pair parent hashing (32-byte siblings).

Returns `{"status":"pending",...}` while `ft_transfer` is in flight. Failed transfers roll back balances and emit `SOCIAL_TRANSFER_FAILED`.

### Owner / admin methods

Attach exactly **1 yoctoNEAR** unless noted.

| Method | Who | Description |
|--------|-----|-------------|
| `set_action_config(action_id, config)` | owner | Create or update action registry entry |
| `set_boost_contract_id(boost_contract_id?)` | owner | Set or clear boost contract; when set, `treasury_bps` routes to boost credits |
| `remove_action_config(action_id)` | owner | Remove action |
| `set_season_config(season_id, config)` | owner | Create or update season window |
| `set_paused(paused)` | owner | Pause spends and user claims |
| `set_treasury_id(treasury_id)` | owner | Update treasury account |
| `set_settlement_publisher(account_id?)` | owner | Set optional season root publisher |
| `set_owner(owner_id)` | owner | Transfer contract ownership |
| `publish_season_root(season_id, root, total_amount, active)` | owner or settlement publisher | Publish Merkle root after season `ends_at_ns` |
| `withdraw_treasury(amount)` | owner or `treasury_id` | Withdraw accrued treasury balance |
| `update_contract()` | owner | Deploy new WASM from input bytes, then `migrate` (no 1 yocto) |
| `update_contract_from_hash(code_hash)` | owner | Self-upgrade from global contract hash, then `migrate` |

### View methods

| Method | Description |
|--------|-------------|
| `get_contract_info()` | Version, owner, token, treasury, boost contract, publisher, pause flag, balances, action/season id lists |
| `get_action_config(action_id)` | Action registry entry |
| `get_season_config(season_id)` | Season config plus `is_live` and `claim_open` |
| `get_season_ids()` | Configured season ids |
| `get_action_totals(action_id)` | Aggregate spend and routing totals per action |
| `get_target_totals(target_type, target_id)` | Aggregate spend totals per target key |
| `get_target_balance(account_id)` | Claimable target balance for account |
| `get_season_pool(season_id)` | Unclaimed SOCIAL in season pool |
| `get_season_settlement(season_id)` | Published root, amounts, claim progress |
| `has_claimed_season(season_id, account_id)` | Whether account already claimed |

### `ActionConfig` fields

| Field | Description |
|-------|-------------|
| `label` | Human-readable label (max 64 chars) |
| `active` | Whether action accepts spends |
| `min_amount` | Minimum SOCIAL amount (yocto) |
| `target_types` | Allowed `target_type` slugs |
| `treasury_bps` | Protocol fee share; accrues on social-spend, or routes to boost credits when `boost_contract_id` is set |
| `season_pool_bps` | Share to `season_id` pool |
| `target_bps` | Share to recipient target balance |
| `burn_bps` | Share burned via token `burn` (default `0`) |
| `season_required` | Require `season_id` in message |
| `allow_self_target` | Allow `recipient_id == sender_id` |

`treasury_bps + season_pool_bps + target_bps + burn_bps` must equal `10_000`.

### `SeasonConfig` fields

| Field | Description |
|-------|-------------|
| `label` | Human-readable label |
| `active` | Whether season accepts spends |
| `starts_at_ns` | Spend window start (block timestamp) |
| `ends_at_ns` | Spend window end |
| `claim_starts_at_ns` | Optional claim open time; defaults to `ends_at_ns` |

## Constants

| Constant | Value |
|----------|-------|
| SOCIAL decimals | 18 (`1 SOCIAL` = `10^18` yocto) |
| Min spend (default actions) | `0.01 SOCIAL` |
| Max `ft_on_transfer` msg | 4,096 bytes |
| Max metadata | 1,024 bytes serialized |
| Max `target_id` | 256 bytes |
| Max slug fields | 64 bytes |
| BPS denominator | 10,000 |

## Events

All events use NEP-297 with `standard: "onsocial"`, `version: "1.0.0"`, and the `EVENT_JSON:` log prefix. Each payload includes `account_id` (the emitting context account).

| Event | When |
|-------|------|
| `SOCIAL_SPENT` | Successful `ft_on_transfer` spend |
| `ACTION_CONFIG_SET` | Action registry updated |
| `ACTION_CONFIG_REMOVED` | Action removed |
| `SEASON_CONFIG_SET` | Season configured |
| `SEASON_ROOT_PUBLISHED` | Merkle root published |
| `SOCIAL_TRANSFERRED` | Outbound `ft_transfer` succeeded |
| `SOCIAL_TRANSFER_FAILED` | Outbound transfer failed (state rolled back) |
| `PAUSE_UPDATED` | Pause flag changed |
| `TREASURY_UPDATED` | Treasury account changed |
| `SETTLEMENT_PUBLISHER_UPDATED` | Settlement publisher changed |
| `OWNER_CHANGED` | Owner transferred |
| `CONTRACT_UPGRADE` | `migrate` completed |

Primary indexer table: `social_spend_events` (Substreams / Hasura).

## Errors

| Error | Meaning |
|-------|---------|
| `Unauthorized` | Caller is not owner, treasury, or settlement publisher |
| `InvalidInput` | Bad message, config, timing, or target |
| `InvalidAmount` | Zero or below `min_amount` |
| `ContractPaused` | Spends or claims blocked |
| `ActionNotFound` / `ActionDisabled` | Unknown or inactive action |
| `InsufficientBalance` | Pool, treasury, or target balance too low |
| `TransferPending` | Prior outbound transfer not finalized |
| `AlreadyClaimed` | Season reward already claimed |
| `InvalidProof` | Merkle proof does not verify |

## License

See [LICENSE.md](../../LICENSE.md) in repository root.
