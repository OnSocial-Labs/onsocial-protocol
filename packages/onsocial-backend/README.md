# onsocial-backend

Telegram rewards bot, partner reward crediting, portal rewards, partners, seasons, and governance helpers.

Default port: **4001**.

## Quick start

```bash
# from repo root
pnpm install
pnpm --filter onsocial-backend dev
```

Required in production: `TELEGRAM_BOT_TOKEN`, Postgres, and relayer credentials. See `src/config/index.ts`.

## What it does

| Area | Role |
|---|---|
| Telegram bot | Group activity → reward credits; `/start` link, balance, claim |
| Portal rewards | Partner-authenticated credit API for Portal / partners |
| Partners | Applications, key claim / rotate, governance handoff |
| Seasons | Rally join / standing / settlement helpers |
| Governance | DAO feed and proposal helpers for Portal |

Credits go through the **relayer** to `rewards.onsocial.*`. Season settlement can publish roots to **social-spend**.

## Config (common)

| Variable | Default / notes |
|---|---|
| `PORT` | `4001` |
| `NEAR_NETWORK` | `testnet` \| `mainnet` |
| `RELAYER_URL` | `http://localhost:3040` |
| `REWARDS_CONTRACT` | `rewards.onsocial.testnet` / `.near` |
| `SOCIAL_SPEND_CONTRACT` | `social-spend.onsocial.testnet` / `.near` |
| `TELEGRAM_GROUP_IDS` | Comma-separated group IDs |

## Scripts

```bash
pnpm --filter onsocial-backend migrate
pnpm --filter onsocial-backend test
pnpm --filter onsocial-backend check
```

## Related

- [rewards-onsocial](../../contracts/rewards-onsocial) — on-chain pool / claim
- [@onsocial-id/rewards](../onsocial-rewards) — partner SDK + optional Grammy bot
- [Relayer](../onsocial-relayer) — `/execute_rewards`, season settlement
