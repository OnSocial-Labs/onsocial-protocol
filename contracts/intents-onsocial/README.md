# intents-onsocial

NEAR smart contract: a programmable bounty marketplace for social outcomes.

## Concept

Anyone can post a signed **offer** ("I'll pay X NEAR if outcome Y is met by deadline Z"). Anyone else can **claim** the offer by submitting a cryptographic proof from a trusted oracle that the outcome was met. The contract holds escrow and settles atomically — no platform middleman.

## v1 Scope (Phase 1)

- **Asset**: native NEAR only (NEP-141 in v1.1)
- **Outcome type**: `BoostViews { post_path, target_views }` (one schema; more in v1.1)
- **Proof**: ed25519 signature from a registered oracle public key over `(offer_id, winner, evidence_hash)`
- **Pricing**: fixed bounty (locked at creation)
- **Settlement**: first valid claim wins
- **Auth**: NEP-366 SignedDelegateAction via relayer (gasless) for both creators and solvers; predecessor-trusted on contract

## State machine

```
Open ──claim──▶ Claimed
  │
  ├─cancel(creator, before deadline)─▶ Cancelled
  └─cancel(anyone,  after deadline)──▶ Expired
```

All terminal states refund/release funds via optimistic-transfer + rollback callback.

## Key invariants

1. Total escrow = sum of `Open` offer bounties + storage deposits at all times.
2. Funds only leave the contract through `claim_offer` (to solver) or `cancel_offer` (to creator). No admin withdraw.
3. Solvers can never write to user namespaces — this contract has no user namespaces of its own; cross-contract calls into `core-onsocial` use the solver's own predecessor identity.
4. Oracle key set is owner-managed and emits events on changes.

## Build

```bash
make build-contract-intents-onsocial
```

## Test

```bash
make test-unit-contract-intents-onsocial
make test-integration-contract-intents-onsocial
```

## Status

Phase 1 scaffold — happy paths + safety rails. Not yet production. See `Resources/onsocial_plan.md` for the roadmap.
