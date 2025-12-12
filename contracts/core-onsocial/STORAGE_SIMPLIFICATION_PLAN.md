# Storage Simplification Plan

## Executive Summary

This document outlines a plan to simplify the storage architecture in `core-onsocial` by removing the complex sharding system while retaining event-based partition hints for off-chain indexers.

**Status:** 🚧 New contract in development - no migration needed, direct replacement

**Expected Benefits:**
- ~70% reduction in storage key length (90→25 bytes avg)
- ~70% reduction in storage costs
- Human-readable keys for easier debugging
- Data locality for related user data
- Prefix-based queries become possible
- Simpler codebase, fewer potential bugs

---

## Current Architecture (To Be Removed)

### Storage Key Format (Current - Overcomplicated)
```
shards/{shard_id}/accounts/{account_id}/subshards/{subshard_id}/{hex1}/{hex2}/custom/{path_hash}
```

### Example
For path `alice.near/posts/1`:
```
shards/4521/accounts/alice.near/subshards/2847/a3/f2/custom/d8a3f21b4e56c789012345678901234
```
**~90-100 bytes per key** ❌

### Files To Modify
| File | Current State | Action |
|------|---------------|--------|
| `storage/sharding.rs` | `fast_hash()`, `get_shard_subshard()`, `make_unified_key()` | Simplify |
| `storage/utils.rs` | `parse_path()`, `parse_groups_path()` | Keep as-is |
| `state/operations.rs` | Uses `make_unified_key()` | Use simple keys |
| `events/emitter.rs` | Calculates shard/subshard for events | Simplify to partition only |
| `constants.rs` | `NUM_SHARDS=8192`, `NUM_SUBSHARDS=8192` | Remove or reduce |

---

## New Architecture (Target)

### Storage Key Format (Simple)
```
{account_id}/{relative_path}
```

For groups:
```
groups/{group_id}/{relative_path}
```

### Examples
| Data Type | New Key | Length |
|-----------|---------|--------|
| User post | `alice.near/posts/1` | ~20 bytes |
| User profile | `alice.near/profile` | ~20 bytes |
| Group config | `groups/defi-dao/config` | ~25 bytes |
| Group member | `groups/defi-dao/members/bob.near` | ~35 bytes |
| Permission | `groups/defi-dao/permissions/bob.near` | ~40 bytes |

---

## Implementation Tasks

Since this is a new contract in development, we can do a **direct replacement** without migration complexity.

### Task 1: Simplify `storage/sharding.rs`

**Remove:**
- `get_shard_subshard()` function
- Complex key generation with shards/subshards/hex levels

**Keep:**
- `fast_hash()` (still useful for event partitioning)

**Replace `make_unified_key()` with:**
```rust
/// Generate simple storage key
/// Format: {namespace_id}/{relative_path} for accounts
/// Format: groups/{group_id}/{relative_path} for groups
#[inline(always)]
pub fn make_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    if namespace == "groups" {
        format!("groups/{}/{}", namespace_id, relative_path)
    } else {
        format!("{}/{}", namespace_id, relative_path)
    }
}
```

---

### Task 2: Update `state/operations.rs`

Replace all calls to `make_unified_key()` with `make_key()`.

**Before:**
```rust
let unified_key = crate::storage::sharding::make_unified_key(namespace, namespace_id, relative_path);
```

**After:**
```rust
let key = crate::storage::sharding::make_key(namespace, namespace_id, relative_path);
```

---

### Task 3: Simplify `events/emitter.rs`

**Change partition calculation from path-based to namespace-based:**

**Before:**
```rust
let path_hash = fast_hash(relative_path.as_bytes());
let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);
// Events include: shard_id, subshard_id, path_hash
```

**After:**
```rust
// Partition by namespace only - all user data in same partition
let partition = (fast_hash(namespace_id.as_bytes()) % NUM_PARTITIONS as u128) as u16;
// Events include: partition_id only
```

---

### Task 4: Update `constants.rs`

**Remove:**
```rust
pub const NUM_SHARDS: u16 = 8192;
pub const NUM_SUBSHARDS: u32 = 8192;
```

**Add:**
```rust
/// Number of partitions for event routing (indexer optimization)
/// Kept small since it's only for off-chain indexer parallelization
pub const NUM_PARTITIONS: u16 = 256;
```

---

### Task 5: Update `events/types.rs`

**Simplify event structure:**

**Before:**
```rust
pub shard_id: Option<u16>,
pub subshard_id: Option<u32>,
pub path_hash: Option<u128>,
```

**After:**
```rust
pub partition_id: Option<u16>,  // For indexer routing only
```

---

### Task 6: Update Tests

Update integration tests to verify simple key behavior instead of sharding calculations.

---

## Event Schema (Simplified)

### Current Event Structure
```json
{
  "standard": "onsocial",
  "version": "1.0.0",
  "event_type": "GROUP_UPDATE",
  "op_type": "create_group",
  "shard_id": 4521,
  "subshard_id": 2847,
  "path_hash": "d8a3f21b4e56c789...",
  "path": "groups/defi-dao/config",
  "author": "alice.near"
}
```

### New Event Structure
```json
{
  "standard": "onsocial",
  "version": "1.0.0",
  "event_type": "GROUP_UPDATE", 
  "op_type": "create_group",
  "partition_id": 142,
  "path": "groups/defi-dao/config",
  "author": "alice.near"
}
```

**Changes:**
- `shard_id` + `subshard_id` → `partition_id` (namespace-based)
- Remove `path_hash` (path is human-readable now)
- Keep version `1.0.0` (new development)

---

## Benefits for Social Media App

### Query Patterns Now Possible

```typescript
// ✅ Get user's posts by exact key
const post = await contract.get({ keys: ["alice.near/posts/1"] });

// ✅ Get multiple user data in one call
const userData = await contract.get({ 
  keys: [
    "alice.near/profile",
    "alice.near/settings",
    "alice.near/stats"
  ]
});

// ✅ Get group data
const groupConfig = await contract.get({ keys: ["groups/defi-dao/config"] });
const member = await contract.get({ keys: ["groups/defi-dao/members/bob.near"] });

// ✅ List by prefix via NEAR RPC (view_state)
const alicePosts = await viewState("core.onsocial.near", "alice.near/posts/");
const groupMembers = await viewState("core.onsocial.near", "groups/defi-dao/members/");
```

### Indexer Benefits

```
Before (path-based sharding):
├── alice's post 1 → partition 4521
├── alice's post 2 → partition 1847  
├── alice's profile → partition 923
└── (scattered across all 8192 partitions)

After (namespace-based partitioning):
├── alice's post 1 → partition 142
├── alice's post 2 → partition 142
├── alice's profile → partition 142
└── (all in same partition = cache locality)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `storage/sharding.rs` | Replace `make_unified_key()` with `make_key()`, remove `get_shard_subshard()` |
| `state/operations.rs` | Use `make_key()` instead of `make_unified_key()` |
| `events/emitter.rs` | Simplify partition calculation, remove subshard logic |
| `events/types.rs` | Replace shard_id/subshard_id with partition_id |
| `constants.rs` | Remove `NUM_SHARDS`/`NUM_SUBSHARDS`, add `NUM_PARTITIONS` |
| `tests/` | Update event verification tests |

---

## Implementation Order

1. **`constants.rs`** - Add `NUM_PARTITIONS`, keep old constants temporarily
2. **`storage/sharding.rs`** - Add `make_key()`, keep `make_unified_key()` temporarily  
3. **`state/operations.rs`** - Switch to `make_key()`
4. **`events/emitter.rs`** - Simplify to partition-based
5. **`events/types.rs`** - Update event structure
6. **Tests** - Update integration tests
7. **Cleanup** - Remove old sharding code

---

## Estimated Effort

| Task | Time |
|------|------|
| Update constants | 15 min |
| Simplify sharding.rs | 30 min |
| Update operations.rs | 30 min |
| Simplify events | 1 hour |
| Update tests | 1-2 hours |
| **Total** | **3-4 hours** |

---

## Checklist

- [ ] Update `constants.rs`
- [ ] Simplify `storage/sharding.rs`
- [ ] Update `state/operations.rs`
- [ ] Simplify `events/emitter.rs`
- [ ] Update `events/types.rs`
- [ ] Update integration tests
- [ ] Run all tests
- [ ] Remove old sharding code

---

## Ready to Implement

Since this is a new contract in development, we can proceed directly with implementation. No migration complexity needed!

---

## Code Changes Detail

### 1. `storage/sharding.rs` - Simplified Key Generation

**Current:**
```rust
pub fn make_unified_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    let path_hash = fast_hash(relative_path.as_bytes());
    let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);
    let level1 = (path_hash & 0xFF) as u8;
    let level2 = ((path_hash >> 8) & 0xFF) as u8;
    
    write!(&mut key, "shards/{}/{}/{}/subshards/{}/{:02x}/{:02x}/custom/{:x}",
        shard, namespace, namespace_id, subshard, level1, level2, path_hash)
}
```

**Simplified:**
```rust
pub fn make_key(namespace: &str, namespace_id: &str, relative_path: &str) -> String {
    if namespace == "groups" {
        format!("groups/{}/{}", namespace_id, relative_path)
    } else {
        format!("{}/{}", namespace_id, relative_path)
    }
}
```

---

### 2. `events/emitter.rs` - Namespace-Based Partitioning

**Current:**
```rust
let path_hash = fast_hash(relative_path.as_bytes());
let (shard, subshard) = get_shard_subshard(namespace_id, path_hash);
// Events include: shard_id, subshard_id, path_hash
```

**Simplified:**
```rust
// Partition by namespace only - all user data in same partition
let partition = (fast_hash(namespace_id.as_bytes()) % NUM_PARTITIONS as u128) as u16;
// Events include: partition_id only (optional: path for debugging)
```

---

### 3. `state/operations.rs` - Dual-Read for Migration

```rust
pub fn get_entry(&self, full_path: &str) -> Option<DataEntry> {
    // Try simple key first (new format)
    let simple_key = make_simple_key(namespace, namespace_id, relative_path);
    if let Some(data) = env::storage_read(simple_key.as_bytes()) {
        return borsh::from_slice(&data).ok();
    }
    
    // Fall back to sharded key (old format) for backward compatibility
    let sharded_key = make_unified_key(namespace, namespace_id, relative_path);
    if let Some(data) = env::storage_read(sharded_key.as_bytes()) {
        return borsh::from_slice(&data).ok();
    }
    
    None
}

pub fn insert_entry(&mut self, full_path: &str, entry: DataEntry) -> Result<...> {
    // Always write to simple key (new format)
    let simple_key = make_simple_key(namespace, namespace_id, relative_path);
    env::storage_write(simple_key.as_bytes(), &serialized);
    
    // Optionally: delete old sharded key if it exists (cleanup)
    // let sharded_key = make_unified_key(...);
    // env::storage_remove(sharded_key.as_bytes());
}
```

---

## Event Schema Changes

### Current Event Structure
```json
{
  "standard": "onsocial",
  "version": "1.0.0",
  "event_type": "GROUP_UPDATE",
  "op_type": "create_group",
  "shard_id": 4521,
  "subshard_id": 2847,
  "path_hash": "d8a3f21b4e56c789...",
  "path": "groups/defi-dao/config",
  "author": "alice.near"
}
```

### Simplified Event Structure
```json
{
  "standard": "onsocial",
  "version": "1.1.0",
  "event_type": "GROUP_UPDATE", 
  "op_type": "create_group",
  "partition_id": 847,
  "path": "groups/defi-dao/config",
  "author": "alice.near"
}
```

**Changes:**
- `shard_id` → `partition_id` (based on namespace only)
- Remove `subshard_id` (unnecessary complexity)
- Remove `path_hash` (path is now human-readable)
- Bump version to `1.1.0`

---

## Benefits for Social Media App

### Query Patterns Now Possible

```typescript
// ✅ List all posts for a user (prefix query via RPC)
const alicePosts = await viewState("core.onsocial.near", "alice.near/posts/");

// ✅ List all members of a group
const members = await viewState("core.onsocial.near", "groups/defi-dao/members/");

// ✅ Get user's complete profile in one query
const profile = await contract.get({ 
  keys: [
    "alice.near/profile",
    "alice.near/settings",
    "alice.near/stats"
  ]
});
```

### Indexer Benefits

```
Before (path-based sharding):
- alice's post 1 → partition 4521
- alice's post 2 → partition 1847
- alice's profile → partition 923
- (scattered across all partitions)

After (namespace-based partitioning):
- alice's post 1 → partition 847
- alice's post 2 → partition 847
- alice's profile → partition 847
- (all in same partition = better cache locality)
```

---

## Testing Strategy

### Unit Tests to Update
- [ ] `storage/sharding.rs` tests
- [ ] `state/operations.rs` tests
- [ ] `events/emitter.rs` tests

### Integration Tests to Update
- [ ] All 29 existing tests (should pass with dual-read)
- [ ] Add migration tests (old key → new key)
- [ ] Add event schema tests (verify partition_id)

### New Tests to Add
- [ ] Simple key generation correctness
- [ ] Backward compatibility (read old sharded keys)
- [ ] Forward compatibility (write simple keys)
- [ ] Event partition consistency

---

## Rollback Plan

If issues are discovered:

1. **Phase 1-2**: No data changes, safe to revert code
2. **Phase 3**: Events are immutable, but new format is backward compatible
3. **Phase 4**: Dual-read ensures old keys still work
4. **Phase 5**: Don't execute until migration verified complete

---

## Timeline Estimate

| Phase | Effort | Risk |
|-------|--------|------|
| Phase 1: Add simple keys | 1-2 hours | Low |
| Phase 2: Update operations | 2-3 hours | Low |
| Phase 3: Simplify events | 1-2 hours | Low |
| Phase 4: Data migration | 4-8 hours | Medium |
| Phase 5: Cleanup | 2-3 hours | Low |
| Testing & Verification | 4-6 hours | - |
| **Total** | **14-24 hours** | - |

---

## Decision Checklist

- [ ] Review this plan with team
- [ ] Decide on event schema changes (keep path_hash?)
- [ ] Decide on migration strategy (dual-read vs batch)
- [ ] Set up staging environment for testing
- [ ] Create backup of production state before Phase 4
- [ ] Plan indexer updates for new event format

---

## Next Steps

1. **Approve this plan**
2. **Implement Phase 1** (add simple key functions)
3. **Run all tests** to ensure no regressions
4. **Proceed with remaining phases**

Ready to proceed when you are!
