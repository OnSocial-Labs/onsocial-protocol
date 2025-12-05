# Core OnSocial

A decentralized social platform smart contract built on the NEAR Protocol, enabling users to create profiles, post content, interact with others, form groups, and manage permissions. It integrates with Substreams for efficient off-chain indexing and querying via GraphQL.

## Features

- **Content Management**: Create, update, and delete posts, profiles, and graph data.
- **Interactions**: Support for likes, shares, follows, and blocks.
- **Groups**: Create and manage groups with member and admin controls.
- **Messaging**: Secure, permission-based messaging with public, private, or group access.
- **Permissions**: Granular access control for read/write operations using paths and wildcards, with role-based presets and batch checks.
- **Storage**: Flexible storage management with shared pools and per-account tracking.
- **Data Sharding**: Efficient data partitioning using shards for scalability.
- **Substreams Integration**: Optimized for off-chain indexing with GraphQL query support.

## Permission System

The permission system uses a trie-based structure (`PatriciaSet`) for path-based access control, supporting wildcards (`*`, `**`) and role-based presets. It includes caching with block height-based expiration for performance.

### Key Operations

- **Grant Permission**: Use `grant_permission(permission_key, paths, is_write)` to grant read or write access to specific paths.
- **Revoke Permission**: Use `revoke_permission(permission_key, paths)` to revoke access.
- **Grant Role**: Use `grant_role(permission_key, role)` to apply predefined permission sets (e.g., "viewer", "editor", "admin").
- **Batch Check**: Use `batch_is_permitted(permission_key, paths)` to check multiple paths efficiently, reducing gas costs.
- **Cache Expiration**: Cached permission results expire after 100 blocks to prevent memory bloat.

### Role-Based Presets

Predefined roles simplify permission management:
- **viewer**: Grants read access to `profile/*`, `content/*`, `messages/*/public`.
- **editor**: Grants write access to `content/*`, `messages/*`.
- **admin**: Grants full access to `profile/**`, `content/**`, `messages/**`, `groups/**`.

### Examples

#### Granting a Role
Grant "viewer" role to a user for read-only access:
```rust
contract.grant_role(PermissionKey::AccountId("bob.near".parse().unwrap()), "viewer", None);

┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   NEAR Contract │────│    Substreams    │────│   Application   │
│                 │    │                  │    │                 │
│ • Content Store │    │ • Event Stream   │    │ • Rich Feeds    │
│ • Permissions   │    │ • Data Transform │    │ • Search        │
│ • Thread Logic  │    │ • Real-time Sync │    │ • Analytics     │
│ • Events        │    │ • Feed Building  │    │ • Algorithms    │
└─────────────────┘    └──────────────────┘    └─────────────────┘