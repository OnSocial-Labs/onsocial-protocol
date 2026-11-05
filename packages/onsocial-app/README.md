# @onsocial/app

Consumer OnSocial app — pages, feeds, scarces, hubs, guilds, and wallet flows.

Live: [app.onsocial.id](https://app.onsocial.id) · Testnet: [testnet.app.onsocial.id](https://testnet.app.onsocial.id)

## Quick start

```bash
# from repo root
pnpm install
pnpm --filter @onsocial/app dev   # http://localhost:3060
```

`predev` builds workspace deps (`@onsocial/ui`, `@onsocial/rpc`, `@onsocial/sdk`).

## Config

Browser values in `src/lib/app-config.ts`. Defaults follow `NEXT_PUBLIC_NEAR_NETWORK`:

| Variable                   | Testnet default               | Mainnet default           |
| -------------------------- | ----------------------------- | ------------------------- |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet`                     | `mainnet`                 |
| `NEXT_PUBLIC_API_URL`      | `https://testnet.onsocial.id` | `https://api.onsocial.id` |
| `NEXT_PUBLIC_BACKEND_URL`  | `https://testnet.onsocial.id` | `https://api.onsocial.id` |

Local gateway:

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4001
```

Sync secrets from GSM (requires `gcloud` auth) — same pattern as portal; pulls
`ONSOCIAL_API_KEY`, `LAVA_API_KEY`, `FASTNEAR_API_KEY` (OnSocial NEAR RPC via server BFF), and
rewards keys into `packages/onsocial-app/.env.local`:

```bash
NEAR_NETWORK=testnet ./scripts/sync-app-env-from-gsm.sh
```

Server-side chain reads go through `/api/near/rpc` → `@onsocial/rpc`.
`FASTNEAR_API_KEY` and `LAVA_API_KEY` stay on the server. Do not point the browser at public RPC nodes directly.

`GET /api/onapi/data/scarces-token` calls the gateway with `ONSOCIAL_API_KEY` first.
On a gateway timeout, 5xx, or network error, the server reads that one token
(`nft_token`) through `@onsocial/rpc`. `NEAR_RPC_URL`, `FASTNEAR_API_KEY`, and
`LAVA_API_KEY` — the same server variables as `/api/near/rpc` — select a keyed
endpoint when one of them is set. With none set, the server uses public RPC and
logs `SCARCES_TOKEN_GATEWAY_FALLBACK` with `unkeyedPublicRpc: true`. A
token-not-found body and any request 4xx are forwarded and do not fall back.
After repeated gateway failures the route skips the gateway for 30 seconds
(the same window as the RPC circuit breaker) and reads the chain directly.
Successful bodies match the gateway JSON either way. The keys never leave the server.

## Scripts

```bash
pnpm --filter @onsocial/app lint
pnpm --filter @onsocial/app test
pnpm --filter @onsocial/app test:e2e
pnpm --filter @onsocial/app check
```

## Related

- [SDK](../onsocial-sdk) — protocol reads/writes
- [Portal](../onsocial-portal) — governance, partners, seasons
- [UI](../onsocial-ui) — shared primitives
