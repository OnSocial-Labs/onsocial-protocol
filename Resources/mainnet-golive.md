# Mainnet go-live plan (locked)

Mainnet is **token + rewards + treasury**. It is not a live social protocol.

Testnet remains the product network (core, scarces, boost, social-spend, vesting, governance, staking). App, portal, gateway, and indexer stay on testnet until this plan says otherwise.

This file is the runbook. Do not invent a shorter path. Re-check the snapshot with:

```bash
node scripts/check-mainnet-contracts.mjs
```

Snapshot date: **2026-09-05** (official `rpc.mainnet.near.org`). Update the checker and this file together when the chain changes.

## Label

| Network | What is live |
|---|---|
| **Mainnet** | SOCIAL token, Telegram rewards, treasury DAO custody |
| **Testnet** | Full product stack |

SDK / portal / backend already hardcode the missing mainnet IDs (`core.onsocial.near`, `scarces.onsocial.near`, …). Those names are reservations in code, not proof the contracts exist.

Relayer default allowlist on mainnet is **`rewards.onsocial.near` only**. That is correct today.

## Inventory

### Live contracts

| Account | Code | Notes |
|---|---|---|
| `token.onsocial.near` | SOCIAL NEP-141 `ft-1.0.0` | Owner `onsocial.near`. Supply **1,000,000,000**. No access keys. |
| `rewards.onsocial.near` | Rewards `0.1.0` | Owner `onsocial.near`. Relayer is the only authorized caller. App `onsocial_telegram` is active. |
| `treasury.onsocial.near` | Sputnik DAO **v2.3.1** | Council is only `onsocial.near`. Name: “OnSocial Treasury”. |

Rewards volume is real but tiny: 1.3 SOCIAL credited, 1 claimed, 0.1 per Telegram action, 1/day cap, 10,000 app budget. Contract `max_daily` is 1 SOCIAL. Pool holds **400,000,999** SOCIAL.

Treasury: everyone can `AddProposal`, 1 NEAR bond, 7-day period. One approved smoke test returned 1 SOCIAL to root. `get_staking_contract` is empty.

### SOCIAL location (2026-09-05)

| Holder | Amount |
|---|---|
| `onsocial.near` | 599,749,100.61 |
| `rewards.onsocial.near` | 400,000,999.00 |
| `treasury.onsocial.near` | 52,769.64 |
| Elsewhere | ~250,000 already circulating |

Do not treat the three vaults as the whole supply.

### Reserved accounts (exist, no wasm)

| Account | Role |
|---|---|
| `onsocial.near` | Root / council. ~10.67 NEAR. Many keys, including FullAccess. |
| `scarces.onsocial.near` | Name parked. ~6 NEAR. One FullAccess key. |
| `relayer.onsocial.near` | Signer only (expected). ~3 NEAR. 113 keys. |

### Missing accounts

These IDs **do not exist** on mainnet:

- `core.onsocial.near`
- `boost.onsocial.near`
- `social-spend.onsocial.near`
- `founder-vesting.onsocial.near`
- `governance.onsocial.near`
- `staking-governance.onsocial.near`
- `staking-treasury.onsocial.near`
- `fees.onsocial.near` (intents fee recipient; not in the SDK contract map)

Subaccounts of `onsocial.near` cannot be squatted. Creating them early only parks NEAR.

### Testnet contrast

Testnet has wasm on core, scarces, boost, social-spend, token, founder-vesting, governance, both staking contracts, and treasury. Relayer is a signer. `rewards.onsocial.testnet` currently has **no wasm** — inverted vs mainnet. Rehearse deploys on testnet; do not copy testnet’s missing rewards onto mainnet.

## Hygiene before more contracts

Do this on the three live contracts before deploying anything else.

1. **Treasury policy.** Remove or narrow `Everyone:AddProposal` before the DAO is public. 1 NEAR is cheap grief. Testnet template: [`deployment/governance-dao/treasury.remove-everyone-role.testnet.proposal.json`](../deployment/governance-dao/treasury.remove-everyone-role.testnet.proposal.json). Mainnet copy is not filed yet — write one when tightening, do not improvise from memory.
2. **Ownership.** `token` and `rewards` stay owned by `onsocial.near` until a written proposal moves them to treasury or governance. Do not transfer as a side effect of the next deploy.
3. **Keys.** Inventory FullAccess on `onsocial.near`, the 113 relayer keys, and the single FullAccess key on `rewards` and `treasury` (upgrade path). Token has zero keys — keep it that way.
4. **Allowlist.** Relayer stays `rewards.onsocial.near` only. Do not allowlist a name that has no wasm.
5. **Circulation.** The ~250k SOCIAL already outside the vaults is out. Do not assume a clean mint.

## Do not

- Flip `NEAR_NETWORK=mainnet` on app, portal, or gateway.
- Point public Graph / Hasura / substreams at mainnet as if the protocol is up.
- Deploy `core` “just to reserve” without relayer allowlist, indexer start block, and an env freeze.
- Retrack views or `reload_metadata` on the **public** Hasura engine.
- Stand up `governance` until token-weight and staking policy are decided. Root-only treasury council is enough for custody.
- Blue/green Postgres or a second indexer. Not needed yet.
- Treat UI shipping on `main` as mainnet social going live.

## Deploy order (when going public)

Same order as testnet. One contract at a time. Allowlist and index only after wasm + init.

1. Create empty accounts (funding, not squat defense): `core`, `boost`, `social-spend`, `founder-vesting`, `governance`, `staking-governance`, `staking-treasury`.
2. **`core.onsocial.near`** — deploy + init, manager, wNEAR, activate. This is the product.
3. **`scarces.onsocial.near`** — wasm onto the reserved account.
4. **`boost.onsocial.near`** and **`social-spend.onsocial.near`** — they need the live token.
5. **`founder-vesting.onsocial.near`**.
6. **`governance.onsocial.near`** + `staking-governance.onsocial.near`.
7. **`staking-treasury.onsocial.near`**, then treasury `SetStakingContract` ([`set-staking-contract.treasury.mainnet.proposal.json`](../deployment/governance-dao/set-staking-contract.treasury.mainnet.proposal.json)).
8. Grow `RELAYER_ALLOWED_CONTRACTS` as each contract lands. Start from `rewards.onsocial.near`. Never allowlist an empty account.
9. Start the mainnet indexer from the **core genesis block**, not from “now.”
10. Transfer token / rewards / core ownership to treasury or governance only with a filed proposal after the stack is live.

Contract deploy entrypoint: [`Resources/deployment-guide.md`](deployment-guide.md) (`make deploy-contract-<name> NETWORK=mainnet`). DAO / staking helpers: [`scripts/deploy-sputnik-dao-staking.mjs`](../scripts/deploy-sputnik-dao-staking.mjs). Mainnet release workflow default allowlist is still `rewards.onsocial.near` ([`.github/workflows/release-mainnet.yml`](../.github/workflows/release-mainnet.yml)).

## Graph flip (build before public traffic)

Today: one live Hasura on the data host ([`deployment/docker-compose.data.yml`](../deployment/docker-compose.data.yml)). Testnet `Deploy Testnet` and `apply-hasura-permissions.ts sync` untrack/retrack SQL views and `reload_metadata` twice. That is the blip. `HASURA_SKIP_VIEW_REFRESH=1` is a bandage — do not use it as the mainnet design.

Build these rails **before** public mainnet Graph traffic:

1. Postgres may expand in place. The **public Hasura catalog is immutable until a flip**.
2. Two Hasura processes, one Postgres: `hasura-live` + `hasura-next`. Build catalog on `next`, smoke as `service`, Caddy flip, drain the old process.
3. Catalog lives in git. `sync` is a **builder** for `hasura-next`, not a mutate of the public engine.
4. Change classes:
   - **App-only** — no catalog, no SQL. Safe anytime.
   - **Additive SQL** — new tables/columns. Expand Postgres; catalog on `next`; flip.
   - **Catalog change** — permissions / tracked views. Build on `next`; flip.
   - **Breaking** — new view name on `next`; flip; switch app; drop the old view later.
5. Testnet may stay loud. Mainnet never in-place view-retrack or `reload_metadata` on the public engine.

Not needed yet: blue/green Postgres, second indexer.

This track is **not built**. Start it before the first public mainnet Graph client, not after `core` is deployed.

## Ready now vs later

**Now (no new wasm)**

1. Keep testnet as the live product network.
2. Treasury policy + key inventory on the three live contracts.
3. This runbook (locked). Re-run `node scripts/check-mainnet-contracts.mjs` after any mainnet account change.
4. Start Hasura dual-engine work before any public mainnet Graph.

**Later (go-live)**

Follow **Deploy order**. Update this file and the checker in the same change when a reserved name gets wasm or a missing account is created.

## Change control

- Executing a step is a deliberate change. Update inventory + checker in the same PR.
- Do not “just deploy” because the account name exists in the SDK.
- Do not mark the app mainnet-ready until core is live, allowlisted, indexed from genesis, and Graph flips without touching the public catalog.
