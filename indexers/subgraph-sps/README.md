# OnSocial Substreams-Powered Subgraph

🚀 **100x faster indexing** compared to the regular subgraph!

This subgraph uses [Substreams](https://substreams.streamingfast.io/) for parallel block processing, enabling near real-time indexing of the OnSocial protocol on NEAR.

## Architecture

```
NEAR Blockchain
      │
      ▼
StreamingFast Firehose
      │
      ▼
┌─────────────────────┐
│     Substreams      │  ← Rust WASM (100+ blocks/sec parallel processing)
│  map_onsocial_output│
│     graph_out       │
└─────────────────────┘
      │
      ▼ EntityChanges (protobuf)
      │
┌─────────────────────┐
│  The Graph Node     │  ← No AssemblyScript mappings needed!
│ (substreams/graph-  │
│     entities)       │
└─────────────────────┘
      │
      ▼
   GraphQL API
```

## Key Benefits

1. **Speed**: Process 100+ blocks per second vs ~1 block/sec with regular subgraph
2. **No Mappings**: Direct entity output from Rust - no AssemblyScript overhead
3. **Same Schema**: Uses identical GraphQL schema as the regular subgraph
4. **Same Queries**: All existing queries work unchanged

## Entity Types

All entities from the regular subgraph are supported:

- `DataUpdate` - Social data changes (posts, profiles, etc.)
- `StorageUpdate` - Storage deposit/withdrawal events
- `GroupUpdate` - Group management events
- `ContractUpdate` - Contract-level operations
- `PermissionUpdate` - Access control changes
- `Account` - User accounts
- `Group` - Social groups

### Reference Fields (Full Support)

DataUpdate includes all reference fields for social graph traversal:
- `parentPath`, `parentAuthor`, `parentType` - Parent content references
- `refPath`, `refAuthor`, `refType` - Quoted/referenced content
- `refs`, `refAuthors` - Multiple references array

## Deployment

### Prerequisites

```bash
# Install Graph CLI
npm install -g @graphprotocol/graph-cli

# Install Substreams CLI
brew install streamingfast/tap/substreams
```

### Deploy to Graph Studio

1. Create a subgraph at [The Graph Studio](https://thegraph.com/studio/)
2. Authenticate:
   ```bash
   graph auth --studio YOUR_DEPLOY_KEY
   ```
3. Deploy:
   ```bash
   pnpm run deploy:studio
   ```

### Local Development

```bash
# Start local graph node with substreams support
docker-compose up -d

# Create the subgraph
pnpm run create:local

# Deploy
pnpm run deploy:local
```

## Substreams Module

The substreams package (`onsocial-v0.3.0.spkg`) includes:

- `map_onsocial_output` - Typed OnSocial event extraction
- `graph_out` - EntityChanges output for The Graph

### Testing Substreams Directly

```bash
cd ../substreams

# Test typed output
substreams run substreams.yaml map_onsocial_output \
  -e testnet.near.streamingfast.io:443 \
  --start-block 233450024 --stop-block +1

# Test graph output
substreams run substreams.yaml graph_out \
  -e testnet.near.streamingfast.io:443 \
  --start-block 233450024 --stop-block +1
```

## Migration from Regular Subgraph

The substreams-powered subgraph is a drop-in replacement:

1. Same GraphQL schema
2. Same entity IDs
3. Same field names
4. Same query patterns

Simply point your app to the new endpoint once deployed.

## Performance Comparison

| Metric | Regular Subgraph | Substreams-Powered |
|--------|------------------|-------------------|
| Block processing | ~1 block/sec | 100+ blocks/sec |
| Sync time (1M blocks) | ~11 days | ~2.7 hours |
| Memory usage | Higher | Lower |
| Mapping language | AssemblyScript | Rust |

## Files

- `subgraph.yaml` - Subgraph manifest (substreams datasource)
- `onsocial-v0.3.0.spkg` - Compiled substreams package
- `../subgraph/schema.graphql` - Shared GraphQL schema
