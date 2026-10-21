# onsocial-gateway

Unified HTTP API for OnSocial — GraphQL (Hasura), storage, relay, compose, notifications, webhooks, and subscriptions.

Default port: **4000**. Live: [api.onsocial.id](https://api.onsocial.id) · Testnet: [testnet.onsocial.id](https://testnet.onsocial.id)

## Quick start

```bash
# from repo root
pnpm install
pnpm --filter onsocial-gateway dev
```

Configure via environment variables (see `src/config/index.ts`). Default port **4000**.

## Access tiers

Tiers come from **Revolut subscriptions** (or admin wallets → `service`), not from staked SOCIAL:

| Tier      | Rate limit (req/min) | Graph row limit | RPC                                        |
| --------- | -------------------- | --------------- | ------------------------------------------ |
| `free`    | 60                   | 100             | Recent chain state                         |
| `pro`     | 600                  | 1_000           | Recent state plus pinned historical blocks |
| `scale`   | 3_000                | 10_000          | Recent state plus pinned historical blocks |
| `service` | 10_000               | 10_000          | Recent state plus pinned historical blocks |

`ADMIN_WALLETS` always resolve to `service`.

## Surfaces (selection)

| Area          | Paths              | Role                                         |
| ------------- | ------------------ | -------------------------------------------- |
| Auth          | `/auth/*`          | NEAR signature → JWT; refresh; me; tier      |
| Graph         | `/graph/*`         | Hasura GraphQL proxy + health                |
| Storage       | `/storage/*`       | IPFS upload / fetch (Lighthouse)             |
| Relay         | `/relay/*`         | Submit / meta-tx / status                    |
| Compose       | `/compose/*`       | Scarces mint, listings, collections, preview |
| Notifications | `/notifications/*` | List / read / rules; worker fans out events  |
| Webhooks      | `/webhooks/*`      | Outbound delivery                            |
| Subscription  | `/subscription/*`  | Revolut billing plans                        |
| Developer     | `/developer/*`     | OnAPI / developer tooling                    |
| RPC           | `POST /v1/rpc`     | NEAR JSON-RPC. Same OnAPI key and minute cap |
| Analytics     | `/analytics/*`     | Usage metrics                                |

`POST /v1/rpc` takes one JSON-RPC object and the same OnAPI key as GraphQL (`x-api-key: onsocial_…`, or a session JWT). It spends the tier's minute cap. A free key can read or broadcast any recent account on the gateway's network. A request that pins `block_id` or `block_hash` is archival and requires Pro, Scale, or service. `NEAR_RPC_URL` is the private node; until that variable is set, Lava and then FastNear answer.

Prefer the [@onsocial/sdk](../onsocial-sdk) over calling these routes raw.

## Auth flow

1. Client signs `OnSocial Auth: <timestamp>` (ISO-8601 preferred).
2. `POST /auth/login` → JWT with tier.
3. Send `Authorization: Bearer <token>` (or OnAPI key for service paths).

## Revolut (sandbox vs production)

Set `REVOLUT_ENVIRONMENT=sandbox` or `production`. Prefer suffixed secrets:

- `REVOLUT_SECRET_KEY_SANDBOX` / `_PRODUCTION`
- `REVOLUT_PUBLIC_KEY_*`, `REVOLUT_WEBHOOK_SIGNING_SECRET_*`
- `REVOLUT_PRO_VARIATION_ID_*`, `REVOLUT_SCALE_VARIATION_ID_*`

Unsuffixed `REVOLUT_*` remains a fallback.

## Scripts

```bash
pnpm --filter onsocial-gateway test
pnpm --filter onsocial-gateway check
```

## Related

- [SDK](../onsocial-sdk) · [Relayer](../onsocial-relayer) · [Portal](../onsocial-portal)
