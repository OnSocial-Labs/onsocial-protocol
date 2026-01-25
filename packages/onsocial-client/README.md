# @onsocial/client

OnSocial client library for the Substreams indexer. Provides:
- **GraphClient** - Query indexed data from Hasura (Substreams → PostgreSQL → Hasura)
- **StorageClient** - IPFS/Filecoin storage via Lighthouse
- **Types** - All protocol entity types (DataUpdate, GroupUpdate, PermissionUpdate, etc.)

For high-level social features (Profile, Post, Comment schemas), use `@onsocial/sdk`.

## Architecture

```
NEAR Contract → Substreams → PostgreSQL → Hasura GraphQL → @onsocial/client
```

## Prerequisites

**Hasura must be configured with the `graphql-default` naming convention:**

```bash
# Environment variables for Hasura
HASURA_GRAPHQL_EXPERIMENTAL_FEATURES="naming_convention"
HASURA_GRAPHQL_DEFAULT_NAMING_CONVENTION="graphql-default"
```

This enables camelCase field names in GraphQL responses (e.g., `blockHeight` instead of `block_height`).

See: https://hasura.io/docs/latest/schema/postgres/naming-convention/

## Installation

```bash
pnpm add @onsocial/client
```

## Usage

```ts
import { GraphClient, DataUpdate } from '@onsocial/client';

const client = new GraphClient({ network: 'testnet' });

// Get data updates for an account
const updates = await client.getDataUpdates('alice.near');

// Get data by type (profile, posts, etc.)
const posts = await client.getDataByType('alice.near', 'posts');

// Parse the value field
const postData = client.tryParseValue<MyPostType>(posts[0]);

// Get replies to a specific path
const replies = await client.getReplies('alice.near/posts/123');

// Get group updates
const groupEvents = await client.getGroupUpdates('my-group');

// Check indexer sync status
const status = await client.getIndexerStatus();
console.log(`Synced to block: ${status?.blockNum}`);
```

## API

### GraphClient

#### Data Updates
| Method | Description |
|--------|-------------|
| `getDataUpdates(accountId)` | Get all data updates for an account |
| `getDataByType(accountId, type)` | Get data by type (profile, posts, etc.) |
| `getDataByPath(path)` | Get data at specific path |
| `getRecentActivity(limit)` | Get recent global activity |
| `getGroupContent(groupId, dataType?)` | Get content stored under a group |
| `getDataByTarget(targetAccount)` | Get social graph data (followers, etc.) |
| `getReplies(parentPath)` | Get replies to a specific path |
| `getReferences(refPath)` | Get quotes/references to a path |

#### Storage Updates
| Method | Description |
|--------|-------------|
| `getStorageUpdates(author)` | Get storage updates by author |
| `getStorageHistory(targetId)` | Get storage history for account |
| `getStorageByOperation(operation)` | Get storage updates by operation type |

#### Group Updates
| Method | Description |
|--------|-------------|
| `getGroupUpdates(groupId)` | Get all updates for a group |
| `getMemberUpdates(groupId, memberId?)` | Get member-related updates |
| `getProposalUpdates(groupId, proposalId?)` | Get proposal-related updates |
| `getGroupsByAuthor(author)` | Get groups created by an account |
| `getUserMemberships(memberId)` | Get groups a user belongs to |

#### Permission Updates
| Method | Description |
|--------|-------------|
| `getPermissionUpdates(author)` | Get permission updates by author |
| `getPermissionsForAccount(accountId)` | Get permissions for an account |
| `getPermissionByPath(author, targetPath)` | Get permission for specific path |

#### Utility
| Method | Description |
|--------|-------------|
| `getIndexerStatus()` | Get current indexer sync status |
| `customQuery(query, variables)` | Execute custom GraphQL query |
| `parseValue<T>(update)` | Parse JSON value field with error handling |
| `tryParseValue<T>(update)` | Parse JSON value field, returns null on error |

### StorageClient

| Method | Description |
|--------|-------------|
| `upload(file)` | Upload file to IPFS/Filecoin |
| `download(cid)` | Download file by CID |

## Development

```bash
pnpm install
pnpm build
pnpm test
```

## License

MIT
