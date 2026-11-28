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

## Decimals (locked)

| Token | Decimals |
|---|---|
| SOCIAL (`token.onsocial.near`) | **18** |
| wNEAR (`wrap.near`) | 24 |
| USDC | 6 |

`--social` / `--pair` convert with those decimals. Prefer sizing from one side + live reserves (`--pair 1` or `--social …`) so the other leg matches the pool.

### Incident (2026-11-28)

CLI briefly treated SOCIAL as 24 decimals (1e6× too large). Intended `0.002` SOCIAL deposited **2,000**; intended `~0.000825` deposited **~825**. Leave that LP in place; do not remove for cleanup. Fixed in `SOCIAL_DECIMALS = 18`.

## Tiny proof (6783)

Treasury already has Ref storage, MFT registration, SOCIAL balance, and native NEAR. USDC wallet balance is ~0, so prove on **6783** first. Always run `check` first.

```bash
# 1 Ⓝ leg — SOCIAL sized from live reserves (18-decimal safe).
# check uses free NEAR (amount − storage − buffer), and proposer's balance for bonds.
node scripts/treasury-lp-proposals.mjs check --pool 6783 --pair 1 \
  --dao treasury.onsocial.near --signer onsocial.near

NETWORK=mainnet node scripts/treasury-lp-proposals.mjs add --step 1 \
  --dao treasury.onsocial.near --signer onsocial.near --pool 6783 --pair 1
NETWORK=mainnet node scripts/dao-proposal.mjs vote-approve \
  --dao treasury.onsocial.near --signer onsocial.near \
  --file deployment/governance-dao/treasury.lp.6783.01-wrap-deposit-wnear.proposal.json \
  --id <n>
# Confirm Ref get_deposits wrap.near rose, then --step 2, then --step 3.
```

Confirm `mft_balance_of` for `:6783` on the treasury rises after proposal 3 executes.

### Mainnet notes (2026-11-28)

Proposals `7`–`12` ran under the 24-decimal SOCIAL bug (oversized SOCIAL). Shares rose; leave LP as-is.

### +1 NEAR after decimals fix (same day)

Sized with `--pair 1` (SOCIAL from live reserves ≈ **824.69 SOCIAL** at post-bug pool ratio). Proposals `13`–`15` approved:

| Step | Proposal id | Vote tx |
|---|---|---|
| wrap + deposit wNEAR | `13` | `AwzqSd7eN7E3yQSZPFa16VyZxF7UstWyWXSTUbWwEHZ` |
| deposit SOCIAL | `14` | `AwEUhG6pAHTuXhEV4N7U8BPiy1m6NbLYpuEZ595JUiSj` |
| `add_liquidity` | `15` | `4X7dC8BkGCPdbYftR8MpD43EzjFFrLPje2pqW5jh1xHn` |

**Other lessons:**
- Multi-action proposal gas must stay **≤ ~280 TGas** (act_proposal receipt cap is 300). Proposal `6` OOG’d; VoteReject (`DEhaTJ4LQDLfKhLYyBYfTkKynxCwxHjRjTmD8DN9M6qX`).

## Portal / app later

Reuse the same proposal shapes from `buildTreasuryAddLiquidityProposals` — do not invent a second encoding in the UI.
