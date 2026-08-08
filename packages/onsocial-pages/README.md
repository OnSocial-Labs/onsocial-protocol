# @onsocial/pages

Subdomain router for `*.onsocial.id` — validates the account, then redirects to the canonical `@accountId` app URL.

Examples:

- `alice.onsocial.id` → app `@alice.near`
- `alice.testnet.onsocial.id` → app `@alice.testnet`

Default listen port: **3456** (behind Caddy for TLS).

## Quick start

```bash
pnpm --filter @onsocial/pages dev      # wrangler
pnpm --filter @onsocial/pages test
pnpm --filter @onsocial/pages check
```

## Config

| Variable | Role |
|---|---|
| `PORT` | HTTP port (default `3456`) |
| `NEAR_NETWORK` | `testnet` \| `mainnet` |
| `PUBLIC_PAGE_BASE_DOMAIN` | e.g. `onsocial.id` / `testnet.onsocial.id` |
| `PUBLIC_APP_URL` | Canonical app base for redirects |
| `DATA_API_URL` | Gateway base for account validation |
| `CORE_CONTRACT` | Core contract id |

See `src/server.ts` for production HTTP server notes and reserved subdomains.
