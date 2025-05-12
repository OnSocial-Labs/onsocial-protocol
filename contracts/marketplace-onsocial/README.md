# Marketplace-OnSocial Contract

The `marketplace-onsocial` contract powers the marketplace for digital assets within the OnSocial Protocol.

## Key Features

- **Asset Listing**: List digital assets for sale.
- **Asset Purchase**: Facilitate secure purchases of listed assets.

## Key Methods

- `list_item`: List an item for sale with a specified price.
- `buy_item`: Purchase a listed item.

## Deployment

To deploy the contract:

```bash
make deploy CONTRACT=marketplace-onsocial NETWORK=sandbox AUTH_ACCOUNT=test.near
```

## Testing

Run the tests for this contract:

```bash
make test-unit CONTRACT=marketplace-onsocial
```