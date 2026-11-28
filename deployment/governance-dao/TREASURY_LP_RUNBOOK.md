# Treasury Rhea LP add (mainnet)

Pools live on **mainnet only** (`v2.ref-finance.near`):

| Pool | Pair | Id |
|---|---|---|
| SOCIAL–wNEAR | `token.onsocial.near` + `wrap.near` | `6783` |
| SOCIAL–USDC | `token.onsocial.near` + native USDC | `6771` |

LP is owned by **`treasury.onsocial.near`**. Use council proposals — not the FullAccess key — for deposits and `add_liquidity`.

## Proposal count

Three FunctionCall proposals per add (one receiver each):

1. Pair side into Ref (`wrap.near` near_deposit + ft_transfer_call, or USDC ft_transfer_call)
2. SOCIAL `ft_transfer_call` into Ref
3. Ref `add_liquidity`

Builder + CLI: [`scripts/lib/treasury-lp-proposals.mjs`](../../scripts/lib/treasury-lp-proposals.mjs), [`scripts/treasury-lp-proposals.mjs`](../../scripts/treasury-lp-proposals.mjs).

## Tiny proof (6783)

Treasury already has Ref storage, MFT registration, SOCIAL balance, and native NEAR. USDC wallet balance is ~0, so prove on **6783** first.

```bash
Pool 6783 is SOCIAL-scarce on reserves (~0.14 SOCIAL vs ~168 wNEAR), so even a small SOCIAL add needs a large NEAR leg. Always run `check` first.

```bash
# Preconditions (balances, Ref storage/MFT, decoded proposal args) — no txs
# 0.002 SOCIAL ≈ a few NEAR at current reserves; fits treasury wallet (~0.026 SOCIAL, ~14 Ⓝ)
node scripts/treasury-lp-proposals.mjs check --pool 6783 --social 0.002 --dao treasury.onsocial.near

# Emit three JSON files sized from live reserves
node scripts/treasury-lp-proposals.mjs emit --pool 6783 --social 0.002 --fetch-pool

# Add + vote one step at a time (council = onsocial.near):
NETWORK=mainnet node scripts/treasury-lp-proposals.mjs add --step 1 \
  --dao treasury.onsocial.near --signer onsocial.near --pool 6783 --social 0.002
NETWORK=mainnet node scripts/dao-proposal.mjs vote-approve \
  --dao treasury.onsocial.near --signer onsocial.near \
  --file deployment/governance-dao/treasury.lp.6783.01-wrap-deposit-wnear.proposal.json \
  --id <n>
# Confirm Ref get_deposits wrap.near rose, then --step 2, then --step 3.
```


Confirm `mft_balance_of` for `:6783` on the treasury rises after proposal 3 executes.

### Mainnet proof (2026-11-28)

Tiny add **0.002 SOCIAL + ~2.425 wNEAR** on pool `6783` via treasury proposals:

| Step | Proposal id | Vote tx |
|---|---|---|
| wrap + deposit wNEAR | `7` | `EcycSrAokva122oLhct8v2HP5utYmwyqMrhSdKvJMmcM` |
| deposit SOCIAL | `8` | `EUc5kZX35qrNYTJN6DDxX8S3SNCHQM7MBRpC99aew9LT` |
| `add_liquidity` | `9` | `J1UtHS1MPNhip4qShoHv1nBqMovyz8Q6mwieMsXX1Win` |

LP shares `:6783` rose by `208849508158172672368023` (to `14706316736426320232600567`). Ref internal deposits returned to dust.

**Lessons locked into the builder/check:**
- Always `check` first — `0.05 SOCIAL` failed affordability (pool is SOCIAL-scarce; NEAR leg is large).
- Multi-action proposal gas must stay **≤ ~280 TGas** (act_proposal receipt cap is 300). An earlier attempt with 100+250 TGas (`proposal 6`) OOG’d; VoteReject on proposal `6` (`DEhaTJ4LQDLfKhLYyBYfTkKynxCwxHjRjTmD8DN9M6qX`) — rejected.

## Portal / app later

Reuse the same proposal shapes from `buildTreasuryAddLiquidityProposals` — do not invent a second encoding in the UI.
