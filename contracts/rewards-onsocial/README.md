# rewards-onsocial

Gasless SOCIAL reward distribution. Partner apps credit users via authorized callers; users claim through the relayer with zero gas.

Accounts: `rewards.onsocial.testnet` · `rewards.onsocial.near`

## Features

- **App configs** — per-app daily cap, reward per action, authorized callers, budget
- **Credit** — authorized callers credit claimable SOCIAL into user balances
- **Claim** — gasless claim via relayer `execute` → `ft_transfer` from the pool
- **Views** — user reward, claimable, app metrics, pool balance, overview

## Build

```bash
# from repo root
make build-contract-rewards-onsocial
# or
cd contracts/rewards-onsocial && cargo near build
```

## Integration

1. Owner registers an app (`register_app` / admin paths) with rates and authorized callers.
2. Backend / partners credit via relayer (`/execute_rewards`) or authorized contract calls.
3. Users claim through the same relayer path (`action: claim`).

Partner-facing SDK: [`@onsocial-id/rewards`](../../packages/onsocial-rewards). Production bot and APIs: [`onsocial-backend`](../../packages/onsocial-backend).

## Views (selection)

| Method | Purpose |
|---|---|
| `get_user_reward` | Global user reward state |
| `get_claimable` | Claimable yocto-SOCIAL |
| `get_app_config` / `get_app_metrics` | Per-app config and usage |
| `get_contract_info` | Pool totals and contract meta |
| `get_user_rewards_overview` | Combined user + app breakdown |

## Related

- [Relayer](../../packages/onsocial-relayer) — `/execute_rewards`
- [Token](../token-onsocial) — SOCIAL NEP-141
