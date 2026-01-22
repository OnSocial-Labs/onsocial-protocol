# @onsocial/client

OnSocial client library. Provides:
- **GraphClient** - Query data from The Graph subgraph
- **StorageClient** - IPFS/Filecoin storage via Lighthouse
- **Types** - All protocol entity types (DataUpdate, Group, Permission, etc.)

For high-level social features (Profile, Post, Comment schemas), use `@onsocial/sdk`.

## Installation

```bash
pnpm add @onsocial/client
```

## Usage

```ts
import { GraphClient, DataUpdate } from '@onsocial/client';

const graph = new GraphClient({ network: 'testnet' });

// Get data updates
const updates = await graph.getDataByType('alice.near', 'profile');

// Parse the value
const profile = graph.tryParseValue<MyProfileType>(updates[0]);

// Get groups
const groups = await graph.getGroupsByOwner('alice.near');

// Check permissions
const hasAccess = await graph.hasPermission('alice.near', 'bob.near', 'profile');
```

## API

### GraphClient

| Method | Description |
|--------|-------------|
| `getDataUpdates(accountId)` | Get all data updates for an account |
| `getDataByType(accountId, type)` | Get data by type (profile, post, etc.) |
| `getDataByPath(path)` | Get data at specific path |
| `getGroup(groupId)` | Get group by ID |
| `getGroupMembers(groupId)` | Get group members |
| `getProposals(groupId)` | Get governance proposals |
| `getPermissionsGrantedBy(granter)` | Get permissions granted by account |
| `hasPermission(granter, grantee, path)` | Check if permission exists |
| `customQuery(query, variables)` | Execute custom GraphQL query |

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

- `pnpm install`
- `pnpm build`

## License

MIT
