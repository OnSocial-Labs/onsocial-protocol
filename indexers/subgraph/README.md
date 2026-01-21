# OnSocial Subgraph

NEAR Subgraph for indexing OnSocial protocol events.

## Setup

```bash
cd indexers/subgraph
pnpm install
```

## Development

```bash
# Generate types from schema
pnpm codegen

# Build WASM
pnpm build
```

## Deployment

### Subgraph Studio (Recommended)

1. Create subgraph at [thegraph.com/studio](https://thegraph.com/studio)
2. Authenticate:
   ```bash
   graph auth --studio <DEPLOY_KEY>
   ```
3. Deploy:
   ```bash
   pnpm deploy:testnet  # or deploy:mainnet
   ```

### Local Graph Node

```bash
# Start local node (requires Docker)
docker-compose up

# Create and deploy
pnpm create:local
pnpm deploy:local
```

## Configuration

Edit `subgraph.yaml` to change:
- `network`: `near-testnet` or `near-mainnet`
- `source.account`: Contract to index
- `source.startBlock`: Block to start indexing from

## Entities

| Entity | Description |
|--------|-------------|
| `DataUpdate` | Profile, post, and settings changes |
| `StorageUpdate` | Deposits, withdrawals, charges |
| `GroupUpdate` | Group membership changes |
| `ContractUpdate` | Admin/config changes |
| `Account` | Aggregated account state |

## Example Queries

```graphql
# Get user's recent data updates
query GetUserData($accountId: String!) {
  dataUpdates(
    where: { accountId: $accountId }
    orderBy: blockTimestamp
    orderDirection: desc
    first: 20
  ) {
    path
    value
    operation
    blockTimestamp
  }
}

# Get account with balance
query GetAccount($id: ID!) {
  account(id: $id) {
    storageBalance
    dataUpdateCount
    lastActiveAt
  }
}
```
