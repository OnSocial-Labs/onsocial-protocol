# @onsocial/portal

Protocol portal — **Own the Graph.** Governance, partners, seasons/rally, boost, transparency, OnAPI, and SDK docs surfaces.

Live: [portal.onsocial.id](https://portal.onsocial.id) · Testnet: [testnet.onsocial.id](https://testnet.onsocial.id)

## Quick start

```bash
# from repo root
pnpm install
pnpm --filter @onsocial/portal dev   # http://localhost:3000
```

Network helpers:

```bash
pnpm --filter @onsocial/portal dev:testnet
pnpm --filter @onsocial/portal dev:mainnet
pnpm --filter @onsocial/portal dev:both          # testnet :3000, mainnet :3001
pnpm --filter @onsocial/portal dev:local-sandbox  # local gateway + Revolut sandbox
```

## Config

Browser values: `src/lib/portal-config.ts`  
Server-only: `src/lib/portal-server-config.ts`

| Variable | Notes |
|---|---|
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` \| `mainnet` |
| `NEXT_PUBLIC_API_URL` | Gateway (testnet: `https://testnet.onsocial.id`, mainnet: `https://api.onsocial.id`) |
| `NEXT_PUBLIC_BACKEND_URL` | Backend / same host as gateway in many deploys |
| `ONSOCIAL_API_KEY` | Server-only service OnAPI key (never `NEXT_PUBLIC_*`) |
| `ONSOCIAL_PORTAL_REWARDS_API_KEY` | Server-only; maps to `ONSOCIAL_PORTAL_REWARDS_APP_ID` in backend `partner_keys` |

Local gateway + billing sandbox:

```bash
NEXT_PUBLIC_NEAR_NETWORK=testnet
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_BACKEND_URL=http://localhost:4000
```

Sync secrets from GSM (requires `gcloud` auth):

```bash
NEAR_NETWORK=testnet ./scripts/sync-portal-env-from-gsm.sh
```

Provision portal rewards key: `bash scripts/provision-portal-rewards-key.sh` from repo root.

## Layout

```
src/
├── app/                 # App Router pages (home, governance, season, partners, …)
├── components/          # Nav, hero sections, providers, shared UI
├── features/            # Governance, season/rally, partners, boost, transparency
├── contexts/            # Wallet, profile, season participation, rewards
└── lib/                 # portal-config, toast copy, near helpers
```

## Scripts

```bash
pnpm --filter @onsocial/portal check
pnpm --filter @onsocial/portal build
```

## Related

- [App](../onsocial-app) — consumer product
- [SDK](../onsocial-sdk) · [Gateway](../onsocial-gateway) · [Backend](../onsocial-backend)
