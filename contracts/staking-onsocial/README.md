# Staking-OnSocial Contract

The `staking-onsocial` contract provides staking and rewards functionality within the OnSocial Protocol.

## Key Features

- **Staking**: Allow users to stake tokens.
- **Rewards**: Distribute rewards to stakers.

## Key Methods

- `stake`: Stake tokens to earn rewards.
- `unstake`: Unstake tokens and withdraw them.
- `claim_rewards`: Claim accumulated rewards.

## Deployment

To deploy the contract:

```bash
make deploy CONTRACT=staking-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Testing

Run the tests for this contract:

```bash
make test-unit CONTRACT=staking-onsocial
```