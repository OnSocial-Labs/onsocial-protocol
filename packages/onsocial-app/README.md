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

| Variable | Testnet default | Mainnet default |
|---|---|---|
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` | `mainnet` |
| `NEXT_PUBLIC_API_URL` | `https://testnet.onsocial.id` | `https://api.onsocial.id` |
| `NEXT_PUBLIC_BACKEND_URL` | `https://testnet.onsocial.id` | `https://api.onsocial.id` |

Local gateway:

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4001
```

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
