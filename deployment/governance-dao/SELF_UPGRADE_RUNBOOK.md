# DAO self-upgrade patch runbook

Protocol DAOs (`governance.onsocial.*`, `treasury.onsocial.*`) are not factory children. Upstream Sputnik 2.3.1 `UpgradeSelf` calls the parent as factory and fails. This patch deploys from the DAO’s own `store_blob` storage instead.

**Hard rule:** never delete a DAO FullAccess key until that same account has completed a successful `UpgradeSelf` proposal after the patched code is live. NEAR reviewer signs off before any mainnet key deletion.

## Artifacts

```bash
# Fast build (dev / testnet scratch)
SPUTNIK_FAST_BUILD=1 bash scripts/prepare_sputnik_dao_artifacts.sh

# Proof wasm (different version string, same patch)
SPUTNIK_FAST_BUILD=1 SPUTNIK_DAO_VERSION=2.3.1-onsocial.2 \
  SPUTNIK_OUTPUT_DIR=deployment/governance-dao/artifacts/proof \
  bash scripts/prepare_sputnik_dao_artifacts.sh

# Reproducible docker build (preferred before mainnet)
bash scripts/prepare_sputnik_dao_artifacts.sh
```

Patch source: [`patches/upgrade-self-blob.patch`](patches/upgrade-self-blob.patch)  
Base commit: `2b0f34a3860460f285307ec2ccf36345acbe05a2` (Sputnik 2.3.1)  
Manifest: [`artifacts/manifest.txt`](artifacts/manifest.txt)

Primary patched version: `2.3.1-onsocial.1`  
Proof upgrade version: `2.3.1-onsocial.2`

## Rollout order

### 1. Testnet scratch copies

Create disposable subaccounts under `onsocial.testnet` (example names):

- `dao-self-gov.onsocial.testnet`
- `dao-self-tre.onsocial.testnet`

Fund them, deploy `artifacts/sputnikdao2.wasm`, call `new` with a one-member council you control (e.g. `onsocial.testnet`), bond low enough for ops.

```bash
NETWORK=testnet AUTH_ACCOUNT=<scratch-dao> \
  node scripts/redeploy-dao-fa.mjs deployment/governance-dao/artifacts/sputnikdao2.wasm
# (For brand-new accounts use near CLI create-account + deploy + new; FA redeploy assumes code+state already exist.)
```

Prove proposal upgrade to the proof wasm:

```bash
NETWORK=testnet SIGNER=onsocial.testnet DAO=<scratch-dao> \
  node scripts/dao-store-blob.mjs deployment/governance-dao/artifacts/proof/sputnikdao2.wasm

# Fill hash into upgrade-self.template.json → upgrade-self.<dao>.json
NETWORK=testnet node scripts/dao-proposal.mjs add \
  --dao <scratch-dao> --signer onsocial.testnet \
  --file deployment/governance-dao/upgrade-self.<dao>.json

NETWORK=testnet node scripts/dao-proposal.mjs vote-approve \
  --dao <scratch-dao> --signer onsocial.testnet \
  --file deployment/governance-dao/upgrade-self.<dao>.json --id <id>
```

Confirm `version` is `2.3.1-onsocial.2` (or the proof version you built).

### 2. Live testnet DAOs

Accounts: `governance.onsocial.testnet`, `treasury.onsocial.testnet`.

1. FA redeploy patched `2.3.1-onsocial.1` onto each account (`scripts/redeploy-dao-fa.mjs`).
2. `store_blob` the proof wasm, add + approve `UpgradeSelf`.
3. Confirm `version` moved to the proof string.
4. Only then delete that account’s FullAccess key (testnet).

### 3. Mainnet treasury (done)

Account: `treasury.onsocial.near` — patched to `2.3.1-onsocial.2` via FA redeploy + proposal proof. FA key still held. See [`SELF_UPGRADE_STATUS.md`](SELF_UPGRADE_STATUS.md).

### 3b. Mainnet governance (done)

Account: `governance.onsocial.near` — patched to `2.3.1-onsocial.2` via FA redeploy + proposal proof. FA key still held. See [`SELF_UPGRADE_STATUS.md`](SELF_UPGRADE_STATUS.md).

### 4. Key deletion checklist (per account)

- [ ] Patched code live on the account
- [ ] `store_blob` succeeded for the proof (or next) wasm
- [ ] `UpgradeSelf` proposal approved and executed
- [ ] `version` / code hash matches the intended wasm
- [ ] NEAR reviewer sign-off recorded (mainnet)
- [ ] Delete FullAccess key
- [ ] Confirm account has zero FullAccess keys
- [ ] Update golive inventory

## Out of scope

- Factory shim on `onsocial.near`
- Rewards / token FA keys
- Renaming DAOs or moving staking / LP / proposers
