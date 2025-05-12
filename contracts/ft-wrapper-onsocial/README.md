# FT-Wrapper-OnSocial Contract

The `ft-wrapper-onsocial` contract facilitates token transfers and cross-chain bridging within the OnSocial Protocol.

## Key Features

- **Token Transfers**: Handle deposits, withdrawals, and transfers.
- **Cross-Chain Bridging**: Enable token bridging across blockchains.

## Key Methods

- `transfer`: Transfer tokens between accounts.
- `deposit`: Deposit tokens into the contract.
- `withdraw`: Withdraw tokens from the contract.
- `bridge`: Bridge tokens to another blockchain.

## Deployment

To deploy the contract:

```bash
make deploy CONTRACT=ft-wrapper-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Testing

Run the tests for this contract:

```bash
make test-unit CONTRACT=ft-wrapper-onsocial
```