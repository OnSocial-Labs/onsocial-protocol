# Core OnSocial

A decentralized social platform smart contract built on the NEAR Protocol, enabling users to create profiles, post content, interact with others, form groups, and manage permissions. It integrates with Substreams for efficient off-chain indexing and querying via GraphQL.

## Features

- **Content Management**: Create, update, and delete posts, profiles, and graph data via the unified `set` API.
- **Groups**: Create and manage groups with member controls, governance proposals, and voting.
- **Permissions**: Path-based access control with granular permission flags (WRITE, MODERATE, MANAGE).
- **Storage**: Flexible storage management with shared pools and per-account tracking.
- **Data Sharding**: Efficient data partitioning using 8192×8192 shards for scalability.
- **Events**: Borsh-encoded events for efficient off-chain indexing via Substreams.

## Public API

### Data Operations

```rust
// Write data (requires storage deposit)
set(data: Value, event_config: Option<EventConfig>) -> Result<(), SocialError>

// Write data on behalf of another account (relayer pattern)
set_for(target_account: AccountId, data: Value, event_config: Option<EventConfig>) -> Result<(), SocialError>

// Read data by exact keys
get(keys: Vec<String>, account_id: Option<AccountId>, data_type: Option<String>, include_metadata: Option<bool>) -> HashMap<String, Value>
```

### Permission System

The permission system uses path-based key-value storage with bitwise permission flags:

| Flag | Value | Description |
|------|-------|-------------|
| WRITE | 1 | Can write to the path |
| MODERATE | 2 | Can moderate content at the path |
| MANAGE | 4 | Can grant/revoke permissions for the path |

#### Key Operations

```rust
// Grant or revoke permissions (permission_flags = 0 to revoke)
set_permission(grantee: AccountId, path: String, permission_flags: u8, expires_at: Option<u64>) -> Result<(), SocialError>

// Check if user has specific permission
has_permission(owner: AccountId, grantee: AccountId, path: String, permission_flags: u8) -> bool

// Get all permission flags for a user on a path
get_permissions(owner: AccountId, grantee: AccountId, path: String) -> u8
```

#### Examples

```rust
// Grant write permission to bob for alice's posts
contract.set_permission("bob.near".parse().unwrap(), "posts", 1, None);

// Grant admin (all permissions) with 30-day expiration
let expires = env::block_timestamp() + 30 * 24 * 60 * 60 * 1_000_000_000;
contract.set_permission("bob.near".parse().unwrap(), "content", 7, Some(expires));

// Revoke all permissions
contract.set_permission("bob.near".parse().unwrap(), "posts", 0, None);

// Check permission
let can_write = contract.has_permission(
    "alice.near".parse().unwrap(),
    "bob.near".parse().unwrap(),
    "posts".to_string(),
    1
);
```

### Group Operations

```rust
// Create a group (set member_driven: true for proposal-based governance)
create_group(group_id: String, config: Value) -> Result<(), SocialError>

// Join a group (auto-join for public, creates request for private)
join_group(group_id: String, requested_permissions: u8) -> Result<(), SocialError>

// Leave a group
leave_group(group_id: String) -> Result<(), SocialError>

// Member management (owner/admin only)
add_group_member(group_id, member_id, permission_flags, event_config) -> Result<(), SocialError>
remove_group_member(group_id, member_id, event_config) -> Result<(), SocialError>

// Join request management
approve_join_request(group_id, requester_id, event_config) -> Result<(), SocialError>
reject_join_request(group_id, requester_id, reason, event_config) -> Result<(), SocialError>
cancel_join_request(group_id, event_config) -> Result<(), SocialError>

// Moderation
blacklist_group_member(group_id, member_id, event_config) -> Result<(), SocialError>
unblacklist_group_member(group_id, member_id, event_config) -> Result<(), SocialError>

// Ownership
transfer_group_ownership(group_id, new_owner, remove_old_owner, event_config) -> Result<(), SocialError>
set_group_privacy(group_id, is_private, event_config) -> Result<(), SocialError>

// Governance (member-driven groups only)
create_group_proposal(group_id, proposal_type, changes, event_config) -> Result<String, SocialError>
vote_on_proposal(group_id, proposal_id, approve, event_config) -> Result<(), SocialError>
```

### Query Operations

```rust
// Group queries
get_group_config(group_id: String) -> Option<Value>
get_member_data(group_id: String, member_id: AccountId) -> Option<Value>
get_group_stats(group_id: String) -> Option<Value>
get_join_request(group_id: String, requester_id: AccountId) -> Option<Value>

// Membership checks
is_group_member(group_id: String, member_id: AccountId) -> bool
is_group_owner(group_id: String, user_id: AccountId) -> bool
is_blacklisted(group_id: String, user_id: AccountId) -> bool
has_group_admin_permission(group_id: String, user_id: AccountId) -> bool
has_group_moderate_permission(group_id: String, user_id: AccountId) -> bool

// Contract status
get_contract_status() -> ContractStatus
get_config() -> GovernanceConfig
get_storage_balance(account_id: AccountId) -> Option<Storage>
```

### Contract Administration

```rust
// Status management (manager only)
enter_read_only() -> bool    // Pause writes for maintenance
resume_live() -> bool        // Resume normal operation
activate_contract() -> bool  // One-time activation from Genesis
```

## Event System

All mutating operations emit Borsh-encoded events with the prefix `EVENT:`. Event types:

| Event Type | Operations |
|------------|------------|
| `DATA_UPDATE` | set, remove |
| `STORAGE_UPDATE` | deposit, withdraw, share_storage, return_storage |
| `PERMISSION_UPDATE` | grant, revoke |
| `GROUP_UPDATE` | create_group, join, leave, add_member, remove_member, proposals, votes, etc. |
| `CONTRACT_UPDATE` | enter_read_only, resume_live, activate_contract, config changes |

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   NEAR Contract │────│    Substreams    │────│   Application   │
│                 │    │                  │    │                 │
│ • Content Store │    │ • Event Stream   │    │ • Rich Feeds    │
│ • Permissions   │    │ • Data Transform │    │ • Search        │
│ • Groups        │    │ • Real-time Sync │    │ • Analytics     │
│ • Events        │    │ • Feed Building  │    │ • Algorithms    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Storage & Sharding

Data is distributed across 8192 × 8192 = 67M storage slots using xxHash-based sharding:

1. **Account data**: `shards/{shard}/accounts/{account_id}/subshards/{subshard}/...`
2. **Group data**: `shards/{shard}/groups/{group_id}/subshards/{subshard}/...`

This architecture enables:
- O(1) lookups for exact keys
- Horizontal scalability
- Efficient indexer consumption

**Note**: Prefix/wildcard queries are not supported on-chain due to sharded storage. Use an indexer for listing operations.
