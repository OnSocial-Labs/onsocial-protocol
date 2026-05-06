# Core OnSocial Contract

Core NEAR contract for OnSocial social data, groups, governance proposals, permissions, storage accounting, and protocol events.

Reference for integrators: public methods, request payloads, caller resolution, storage behavior, and event format.

## Public Surface

### Request entrypoints

Most request-driven state changes use:

```rust
pub fn execute(&mut self, request: Request) -> Result<Value, SocialError>
```

Privileged request actions rejected by `execute` use:

```rust
pub fn execute_admin(&mut self, request: Request) -> Result<Value, SocialError>
```

### Admin methods

- `enter_read_only()`
- `resume_live()`
- `activate_contract()`
- `update_config(update)`
- `update_manager(new_manager)`
- `update_contract()`
- `update_contract_from_hash(code_hash)`
- `set_wnear_account(wnear_account_id)`

### Views

- Contract metadata: `get_contract_status()`, `get_version()`, `get_config()`, `get_contract_info()`
- Data: `get(keys, account_id)`, `get_one(key, account_id)`, `list_keys(prefix, from_key, limit, with_values)`, `count_keys(prefix)`
- Storage: `get_storage_balance(account_id)`, `get_platform_pool()`, `get_group_pool_info(group_id)`, `get_shared_pool(pool_id)`, `get_platform_allowance(account_id)`, `get_wnear_account()`
- Permissions: `has_permission(...)`, `get_permissions(...)`, `get_key_permissions(...)`, `has_key_permission(...)`, `has_group_admin_permission(...)`, `has_group_moderate_permission(...)`
- Groups: `get_group_config(group_id)`, `get_member_data(group_id, member_id)`, `is_group_member(group_id, member_id)`, `is_group_owner(group_id, user_id)`, `is_blacklisted(group_id, user_id)`, `get_join_request(group_id, requester_id)`, `get_group_stats(group_id)`
- Governance: `get_proposal(group_id, proposal_id)`, `get_proposal_tally(group_id, proposal_id)`, `get_vote(group_id, proposal_id, voter)`, `get_proposal_by_sequence(group_id, sequence_number)`, `get_proposal_count(group_id)`, `list_proposals(group_id, from_sequence, limit)`

### External callback surface

- `ft_on_transfer(sender_id, amount, msg)` for configured wNEAR deposits

## Caller Resolution

Caller identity is resolved from `env::predecessor_account_id()`.

`execute` and `execute_admin` therefore use the same runtime caller path for direct wallet calls, function-call access keys, and NEP-366 delegate-action inner receipts. In a delegate-action flow, the contract sees the delegated user as `predecessor_account_id`, not the relayer.

## Request Shape

`Request` has three fields:

- `target_account`: optional, defaults to the caller
- `action`: required tagged enum serialized with a lowercase snake-case `type`
- `options.refund_unused_deposit`: optional, defaults to `false`

Minimal valid write payload:

```json
{
  "request": {
    "action": {
      "type": "set",
      "data": {
        "profile/name": "Alice",
        "profile/bio": "Web3 Builder"
      }
    }
  }
}
```

Attach deposit when the write increases storage and the account is not already covered by personal balance or sponsored storage.

Paths are account-scoped. With no `target_account`, `profile/name` is stored under the caller's namespace. To write another account's namespace, pass `target_account` and satisfy the relevant permission checks.

Minimal `get` arguments:

Views are exact-key reads. They do not expand wildcards.

```json
{
  "account_id": "alice.near",
  "keys": ["profile/name", "profile/bio"]
}
```

When `account_id` is provided, keys may be relative. Without `account_id`, pass full keys such as `alice.near/profile/name`.

## Return Values

`execute` and `execute_admin` return JSON values matching the action:

- `CreateGroup` returns the created `group_id`
- `CreateProposal` returns the created `proposal_id`
- all other actions return `null`

## Actions

| Domain | Actions |
| --- | --- |
| Data | `Set` |
| Groups | `CreateGroup`, `JoinGroup`, `LeaveGroup`, `AddGroupMember`, `RemoveGroupMember`, `TransferGroupOwnership`, `SetGroupPrivacy` |
| Moderation | `ApproveJoinRequest`, `RejectJoinRequest`, `CancelJoinRequest`, `BlacklistGroupMember`, `UnblacklistGroupMember` |
| Governance | `CreateProposal`, `VoteOnProposal`, `CancelProposal`, `ExpireProposal` |
| Permissions | `SetPermission`, `SetKeyPermission` |

`SetPermission`, `SetKeyPermission`, and reserved `Set` operation keys such as `permission/*`, `storage/*`, and `status/*` are rejected by `execute` and must use `execute_admin` or the dedicated admin methods.

### Reserved `Set` keys

These keys are not ordinary data paths:

| Key or prefix | Meaning | Route |
| --- | --- | --- |
| `manager` | manager update | `update_manager()` |
| `config` | governance config update | `update_config()` |
| `status/read_only` | enter read-only mode | `enter_read_only()` |
| `status/live` | resume live mode | `resume_live()` |
| `status/activate` | activate contract | `activate_contract()` |
| `storage/*` | storage operations | `execute_admin` with `Set` |
| `permission/grant` | account permission grant | `execute_admin` with `Set` |
| `permission/revoke` | account permission revoke | `execute_admin` with `Set` |

## Storage

Storage is charged and tracked at write time.

- Attached deposit can be converted into user storage balance during `execute`.
- Unused attached deposit is saved by default, or refunded when `options.refund_unused_deposit` is `true`.
- Storage sponsorship can come from personal balance, platform pool allowance, shared pools, or group pools.
- Group mutations scope storage payer state around each operation through `prepare_group_storage` / `cleanup_group_storage`.
- `ft_on_transfer` only accepts the configured wNEAR contract, unwraps funds, and credits user or platform-pool storage after the callback succeeds.

Relevant storage views:

```rust
get_storage_balance(account_id)
get_platform_pool()
get_group_pool_info(group_id)
get_shared_pool(pool_id)
get_platform_allowance(account_id)
```

## Events

State changes emit NEP-297-style logs with the `EVENT_JSON:` prefix:

```json
{
  "standard": "onsocial",
  "version": "1.0.0",
  "event": "DATA_UPDATE",
  "data": []
}
```

Event categories:

- `DATA_UPDATE`
- `STORAGE_UPDATE`
- `PERMISSION_UPDATE`
- `GROUP_UPDATE`
- `CONTRACT_UPDATE`

## License

[LICENSE.md](../../LICENSE.md)
