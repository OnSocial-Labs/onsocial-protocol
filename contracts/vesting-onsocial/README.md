# vesting-onsocial

Single-beneficiary NEAR vesting vault for the OnSocial token.

This contract blueprint is intended for founder vesting first:

- one beneficiary
- one vesting schedule
- one-time funding via the SOCIAL token contract
- true cliff, then linear vesting after the cliff
- claim-only release model
- repo-consistent `EVENT_JSON:` logs

## Recommended Deployment

- Crate/folder: `vesting-onsocial`
- Mainnet account: `founder-vesting.onsocial.near`
- Testnet account: `founder-vesting.onsocial.testnet`

## Recommended Founder Schedule

Conservative default:

- allocation: `125_000_000` SOCIAL
- start: token genesis / TGE timestamp
- cliff: `12 months`
- end: `48 months`
- initial unlock: `0%`
- vesting: `0` before the cliff, then linear between `cliff_at_ns` and `end_at_ns`

Alternate schedule if you keep the current public transparency split:

- allocation: `150_000_000` SOCIAL
- cliff: `12 months`
- end: `48 months`

## Contract Goals

- Unvested tokens cannot be claimed.
- Unvested tokens remain in the vesting vault.
- The contract does not stake or delegate unvested tokens.
- The contract does not expose arbitrary owner withdrawal after funding.
- The beneficiary claims vested balance on demand.

## Funding Model

Funding is expected through `ft_transfer_call` from the SOCIAL token contract.

Recommended invariant:

- only the configured token contract may fund the vault
- funding is allowed once
- funding amount must equal `total_amount`

## Public Interface

Initializer:

- `new(owner_id, token_id, beneficiary_id, total_amount, start_at_ns, cliff_at_ns, end_at_ns)`

Views:

- `get_config() -> VestingConfigView`
- `get_status() -> VestingStatusView`
- `get_claimable_amount() -> U128`
- `get_vested_amount() -> U128`
- `get_unvested_amount() -> U128`

Change methods:

- `claim()`
- `set_beneficiary(new_beneficiary)` optional

Token receiver:

- `ft_on_transfer(sender_id, amount, msg)`

## Vesting Formula

If `now < cliff_at_ns`:

- `vested = 0`

If `now == cliff_at_ns`:

- `vested = 0`

If `now >= end_at_ns`:

- `vested = total_amount`

Otherwise:

- `vested = total_amount * (now - cliff_at_ns) / (end_at_ns - cliff_at_ns)`

Claimable amount:

- `claimable = vested - claimed_amount`

## Events

Use repo-consistent NEP-297 style logs:

- prefix: `EVENT_JSON:`
- standard: `onsocial`
- version: `1.0.0`

Suggested events:

- `VESTING_CREATED`
- `VESTING_FUNDED`
- `VESTING_CLAIMED`
- `CLAIM_FAILED`
- `BENEFICIARY_CHANGED`

Suggested event payload fields:

- `account_id`
- `beneficiary_id`
- `amount`
- `claimed_amount`
- `claimable_amount`
- `total_amount`
- `start_at_ns`
- `cliff_at_ns`
- `end_at_ns`

## Errors

Recommended guard messages:

- `Only owner`
- `Only beneficiary`
- `Invalid vesting schedule`
- `Cliff must be >= start`
- `End must be > cliff`
- `Nothing to claim`
- `Contract not funded`
- `Only configured token can fund vesting`
- `Funding amount mismatch`
- `Already funded`

## Testing Plan

Minimum unit coverage:

- initialization rejects invalid schedule
- claim returns zero before funding
- claim returns zero before cliff
- partial vesting after cliff computes correctly
- full vesting at end computes correctly
- repeated claim only releases delta
- funding rejects wrong token
- funding rejects wrong amount
- second funding attempt fails
- beneficiary rotation works if enabled

## Integration Notes

Before implementation is activated in the monorepo, wire in:

- `Cargo.toml` workspace member
- `configs/contracts.json`
- deployment scripts / Make targets
- transparency page allocation copy if founder allocation changes