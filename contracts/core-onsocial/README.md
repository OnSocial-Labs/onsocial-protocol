# Core OnSocial Contract

Core smart contract for the OnSocial protocol — decentralized social data storage, groups, and permissions.

## Quick Start

```bash
make build-contract-core-onsocial            # Build
make test-unit-contract-core-onsocial        # Unit tests
make test-integration-contract-core-onsocial # Integration tests
```

## Architecture

```
src/
├── api/          # Public contract methods
├── domain/       # Business logic (authz, groups)
├── protocol/     # Request/Action/Auth types
├── state/        # On-chain state models
├── storage/      # Storage accounting
└── validation/   # Input validation
```

## API

### Entry Point

All mutations use the unified `execute` method:

```rust
fn execute(&mut self, request: Request) -> Result<Value, SocialError>
```

### Actions

- **Data:** `Set`
- **Groups:** `CreateGroup`, `JoinGroup`, `LeaveGroup`, `AddGroupMember`, `RemoveGroupMember`
- **Moderation:** `ApproveJoinRequest`, `RejectJoinRequest`, `BlacklistGroupMember`
- **Governance:** `CreateProposal`, `VoteOnProposal`, `CancelProposal`
- **Permissions:** `SetPermission`, `SetKeyPermission`

### Auth Modes

| Mode | Use Case |
|------|----------|
| `Direct` | Standard NEAR transaction (default) |
| `SignedPayload` | Relayer with off-chain signature |
| `DelegateAction` | NEP-366 meta-transactions |
| `Intent` | Intent executor pattern |

### Views

- `get` / `get_one` — Read key-value data
- `get_storage_balance` — Account storage info
- `has_permission` / `has_key_permission` — Permission checks

## License

[LICENSE.md](../../LICENSE.md)
