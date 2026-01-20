// --- Test Utilities ---
use crate::events::types::Event;
#[cfg(test)]
use crate::*;
#[cfg(test)]
use near_sdk::test_utils::{VMContextBuilder, accounts};
#[cfg(test)]
use near_sdk::{AccountId, NearToken, env};
#[cfg(test)]
use std::collections::HashMap;

/// Realistic base timestamp for tests (October 1, 2025 00:00:00 UTC in nanoseconds)
/// This matches the current date and is realistic for NEAR blockchain operations
#[cfg(test)]
pub const TEST_BASE_TIMESTAMP: u64 = 1727740800000000000;

/// Minimum deposit required for creating proposals (0.1 NEAR)
/// Re-exported here for test convenience
#[cfg(test)]
pub const MIN_PROPOSAL_DEPOSIT: u128 = crate::constants::MIN_PROPOSAL_DEPOSIT;

/// Get a test context with sufficient deposit for creating proposals
#[cfg(test)]
pub fn get_context_for_proposal(predecessor_account_id: AccountId) -> VMContextBuilder {
    get_context_with_deposit(predecessor_account_id, MIN_PROPOSAL_DEPOSIT)
}

/// Calculate realistic storage deposit for typical operations
/// NEAR storage costs are ~1 NEAR per 100KB (10^19 yoctoNEAR per 100,000 bytes)
/// At testnet rates: 1 byte ≈ 10^14 yoctoNEAR = 0.0001 NEAR
///
/// Typical operation costs:
/// - Group creation: ~500-1000 bytes = 0.05-0.1 NEAR
/// - Member addition: ~200-400 bytes = 0.02-0.04 NEAR  
/// - Post creation: ~300-600 bytes = 0.03-0.06 NEAR
/// - Permission grant: ~150-300 bytes = 0.015-0.03 NEAR
///
/// For tests, we use conservative estimates with safety margin
#[cfg(test)]
pub fn calculate_test_deposit_for_operations(num_operations: u32, avg_bytes_per_op: u64) -> u128 {
    use near_sdk::env;

    // Get current storage byte cost (varies by network)
    let byte_cost = env::storage_byte_cost().as_yoctonear();

    // Calculate total bytes needed with 50% safety margin
    let total_bytes = (num_operations as u64) * avg_bytes_per_op;
    let bytes_with_margin = (total_bytes * 3) / 2; // 1.5x safety margin

    // Calculate cost in yoctoNEAR
    bytes_with_margin as u128 * byte_cost
}

/// Get a test context for the given account
#[cfg(test)]
pub fn get_context(predecessor_account_id: AccountId) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(accounts(0))
        .signer_account_id(predecessor_account_id.clone())
        .predecessor_account_id(predecessor_account_id)
        .block_timestamp(TEST_BASE_TIMESTAMP)
        .attached_deposit(NearToken::from_yoctonear(0));
    builder
}

/// Get a test context with attached deposit for the given account
#[cfg(test)]
pub fn get_context_with_deposit(
    predecessor_account_id: AccountId,
    deposit: u128,
) -> VMContextBuilder {
    let mut builder = VMContextBuilder::new();
    builder
        .current_account_id(accounts(0))
        .signer_account_id(predecessor_account_id.clone())
        .predecessor_account_id(predecessor_account_id)
        .block_timestamp(TEST_BASE_TIMESTAMP)
        .attached_deposit(NearToken::from_yoctonear(deposit));
    builder
}

/// Get a test account ID with .near suffix for more realistic testing
pub fn test_account(index: usize) -> AccountId {
    let base_name = match index {
        0 => "alice",
        1 => "bob",
        2 => "charlie",
        3 => "dave",
        4 => "eve",
        5 => "frank",
        6 => "grace",
        7 => "henry",
        8 => "iris",
        9 => "jack",
        _ => "user",
    };
    format!("{}.near", base_name).parse().unwrap()
}

/// Convert the contract's ordered `get` response into a legacy `key -> value` map.
///
/// This keeps tests concise while the public ABI uses ordered `EntryView`.
#[cfg(test)]
pub fn contract_get_values_map(
    contract: &Contract,
    keys: Vec<String>,
    account_id: Option<AccountId>,
) -> HashMap<String, serde_json::Value> {
    contract
        .get(keys, account_id)
        .into_iter()
        .filter_map(|e| e.value.map(|v| (e.requested_key, v)))
        .collect()
}

/// Initialize a live contract for testing
#[cfg(test)]
pub fn init_live_contract() -> Contract {
    let mut contract = Contract::new();
    // Transition to live mode for testing
    contract.platform.status = crate::state::models::ContractStatus::Live;
    contract
}

#[cfg(test)]
pub fn set_request(data: near_sdk::serde_json::Value) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::Set { data },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn set_request_with_options(
    data: near_sdk::serde_json::Value,
    options: Option<crate::protocol::Options>,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::Set { data },
        auth: None,
        options,
    }
}

#[cfg(test)]
pub fn set_request_for(
    target_account: AccountId,
    data: near_sdk::serde_json::Value,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: Some(target_account),
        action: Action::Set { data },
        auth: None,
        options: None,
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Execute request builders for all action types
// ─────────────────────────────────────────────────────────────────────────────

// --- KV Operations ---

#[cfg(test)]
pub fn create_group_request(
    group_id: String,
    config: near_sdk::serde_json::Value,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::CreateGroup { group_id, config },
        auth: None,
        options: None,
    }
}

// --- Group Lifecycle ---

#[cfg(test)]
pub fn join_group_request(group_id: String) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::JoinGroup { group_id },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn leave_group_request(group_id: String) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::LeaveGroup { group_id },
        auth: None,
        options: None,
    }
}

// --- Group Membership Management ---

#[cfg(test)]
pub fn add_group_member_request(
    group_id: String,
    member_id: AccountId,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::AddGroupMember {
            group_id,
            member_id,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn remove_group_member_request(
    group_id: String,
    member_id: AccountId,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::RemoveGroupMember {
            group_id,
            member_id,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn approve_join_request(group_id: String, requester_id: AccountId) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::ApproveJoinRequest {
            group_id,
            requester_id,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn reject_join_request(
    group_id: String,
    requester_id: AccountId,
    reason: Option<String>,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::RejectJoinRequest {
            group_id,
            requester_id,
            reason,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn cancel_join_request(group_id: String) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::CancelJoinRequest { group_id },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn blacklist_group_member_request(
    group_id: String,
    member_id: AccountId,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::BlacklistGroupMember {
            group_id,
            member_id,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn unblacklist_group_member_request(
    group_id: String,
    member_id: AccountId,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::UnblacklistGroupMember {
            group_id,
            member_id,
        },
        auth: None,
        options: None,
    }
}

// --- Group Governance ---

#[cfg(test)]
pub fn transfer_group_ownership_request(
    group_id: String,
    new_owner: AccountId,
    remove_old_owner: Option<bool>,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::TransferGroupOwnership {
            group_id,
            new_owner,
            remove_old_owner,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn set_group_privacy_request(group_id: String, is_private: bool) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::SetGroupPrivacy {
            group_id,
            is_private,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn create_proposal_request(
    group_id: String,
    proposal_type: String,
    changes: near_sdk::serde_json::Value,
    auto_vote: Option<bool>,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::CreateProposal {
            group_id,
            proposal_type,
            changes,
            auto_vote,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn vote_proposal_request(
    group_id: String,
    proposal_id: String,
    approve: bool,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::VoteOnProposal {
            group_id,
            proposal_id,
            approve,
        },
        auth: None,
        options: None,
    }
}

#[cfg(test)]
pub fn cancel_proposal_request(group_id: String, proposal_id: String) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::CancelProposal {
            group_id,
            proposal_id,
        },
        auth: None,
        options: None,
    }
}

// --- Permission Operations ---

#[cfg(test)]
pub fn set_permission_request(
    grantee: AccountId,
    path: String,
    level: u8,
    expires_at: Option<near_sdk::json_types::U64>,
) -> crate::protocol::Request {
    use crate::protocol::{Action, Request};
    Request {
        target_account: None,
        action: Action::SetPermission {
            grantee,
            path,
            level,
            expires_at,
        },
        auth: None,
        options: None,
    }
}

/// Helper to add test members to member-driven groups bypassing proposals
/// NOTE: This is a test-only helper that bypasses normal validation for setup purposes.
/// In production, members should be added through proper proposal workflows.
/// Use this ONLY for setting up test scenarios where you need multiple members to test voting.
#[cfg(test)]
pub fn test_add_member_bypass_proposals(
    contract: &mut crate::Contract,
    group_id: &str,
    member_id: &AccountId,
    _level: u8,
    added_by: &AccountId,
) {
    test_add_member_bypass_proposals_with_timestamp(
        contract,
        group_id,
        member_id,
        _level,
        added_by,
        env::block_timestamp(),
    );
}

/// Helper to add test members with specific joined_at timestamp
#[cfg(test)]
pub fn test_add_member_bypass_proposals_with_timestamp(
    contract: &mut crate::Contract,
    group_id: &str,
    member_id: &AccountId,
    _level: u8,
    added_by: &AccountId,
    joined_at: u64,
) {
    use near_sdk::env;
    use near_sdk::serde_json::json;

    // Mirror production behavior: every membership epoch has a dedicated nonce.
    let nonce_path = format!("groups/{}/member_nonces/{}", group_id, member_id.as_str());
    let previous_nonce = contract
        .platform
        .storage_get(&nonce_path)
        .and_then(|v| v.as_u64());
    let new_nonce = previous_nonce.unwrap_or(0).saturating_add(1).max(1);
    contract
        .platform
        .storage_set(&nonce_path, &json!(new_nonce))
        .expect("Test setup: failed to set member nonce");

    // Add member data directly (test-only bypass)
    let member_data = json!({
        "level": 0,
        "joined_at": joined_at.to_string(),
        "added_by": added_by.as_str(),
        "is_creator": false
    });
    contract
        .platform
        .storage_set(
            &format!("groups/{}/members/{}", group_id, member_id.as_str()),
            &member_data,
        )
        .expect("Test setup: failed to add member");

    // Mirror production behavior: grant default /content WRITE for all members,
    // while keeping global role (group-root) optional.
    let config_key = format!("groups/{}/config", group_id);
    let config = contract
        .platform
        .storage_get(&config_key)
        .unwrap_or_else(|| panic!("Test setup: group config missing for {}", group_id));
    let group_owner_str = config
        .get("owner")
        .and_then(|o| o.as_str())
        .unwrap_or_else(|| panic!("Test setup: group owner missing for {}", group_id));
    let group_owner: AccountId = group_owner_str.parse().unwrap_or_else(|_| {
        panic!(
            "Test setup: invalid group owner account ID for {}",
            group_id
        )
    });

    let mut event_batch = crate::events::EventBatch::new();
    let default_content_path = format!("groups/{}/content", group_id);
    let grant = crate::domain::groups::permissions::kv::PermissionGrant {
        path: &default_content_path,
        level: crate::domain::groups::permissions::kv::types::WRITE,
        expires_at: None,
    };
    crate::domain::groups::permissions::kv::grant_permissions(
        &mut contract.platform,
        &group_owner,
        member_id,
        &grant,
        &mut event_batch,
        None,
    )
    .unwrap_or_else(|e| {
        panic!(
            "Test setup: failed to grant default content permissions: {:?}",
            e
        )
    });
    // Don't emit in test setup - we're just setting up state

    // Update member count
    let stats_key = format!("groups/{}/stats", group_id);
    let mut stats = contract.platform.storage_get(&stats_key).unwrap_or_else(
        || json!({"total_members": 1, "created_at": env::block_timestamp().to_string()}),
    );

    if let Some(obj) = stats.as_object_mut() {
        let current_count = obj
            .get("total_members")
            .and_then(|v| v.as_u64())
            .unwrap_or(1);
        obj.insert("total_members".to_string(), json!(current_count + 1));
        obj.insert(
            "last_updated".to_string(),
            json!(env::block_timestamp().to_string()),
        );
    }

    contract
        .platform
        .storage_set(&stats_key, &stats)
        .expect("Test setup: failed to update stats");
}

/// Helper to remove test members bypassing proposals (for edge case testing)
/// NOTE: This is a test-only helper that simulates member removal for testing edge cases.
/// In production, members should be removed through proper APIs or proposals.
#[cfg(test)]
pub fn test_remove_member_bypass_proposals(
    contract: &mut crate::Contract,
    group_id: &str,
    member_id: &AccountId,
) {
    use near_sdk::env;
    use near_sdk::serde_json::json;

    // Get existing member entry and soft delete it
    let member_path = format!("groups/{}/members/{}", group_id, member_id.as_str());
    if let Some(entry) = contract.platform.get_entry(&member_path) {
        let _ = crate::storage::soft_delete_entry(&mut contract.platform, &member_path, entry)
            .expect("Test setup: failed to soft delete member");
    }

    // Update member count
    let stats_key = format!("groups/{}/stats", group_id);
    if let Some(mut stats) = contract.platform.storage_get(&stats_key) {
        if let Some(obj) = stats.as_object_mut() {
            let current_count = obj
                .get("total_members")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);
            obj.insert(
                "total_members".to_string(),
                json!(current_count.saturating_sub(1)),
            );
            obj.insert(
                "last_updated".to_string(),
                json!(env::block_timestamp().to_string()),
            );
            contract
                .platform
                .storage_set(&stats_key, &stats)
                .expect("Test setup: failed to update stats");
        }
    }
}

/// Decode and verify contract events from logs (NEP-297 JSON format)
#[cfg(test)]
pub fn verify_contract_event(
    log: &str,
    expected_operation: &str,
    expected_prev_status: &str,
    expected_new_status: &str,
) -> bool {
    use near_sdk::serde_json;

    const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

    if !log.starts_with(EVENT_JSON_PREFIX) {
        return false;
    }

    // Extract JSON part after "EVENT_JSON:"
    let json_data = &log[EVENT_JSON_PREFIX.len()..];

    // Parse JSON event
    let event: Event = match serde_json::from_str(json_data) {
        Ok(event) => event,
        Err(_) => return false,
    };

    // Check event type
    if event.event != "CONTRACT_UPDATE" {
        return false;
    }

    // Check operation in data
    if let Some(data) = event.data.first() {
        if data.operation != expected_operation {
            return false;
        }

        // Check extra data contains the expected status transition
        let extra_obj = &data.extra;

        let found_previous = extra_obj
            .get("previous")
            .and_then(|v| v.as_str())
            .map(|s| s.contains(expected_prev_status))
            .unwrap_or(false);

        let found_new = extra_obj
            .get("new")
            .and_then(|v| v.as_str())
            .map(|s| s.contains(expected_new_status))
            .unwrap_or(false);

        found_previous && found_new
    } else {
        false
    }
}

/// Common deposit amounts for typical test scenarios
#[cfg(test)]
pub mod test_deposits {
    use super::*;

    /// Sufficient for adding 5-10 members (~300 bytes each)
    /// Plus proposal index and vote tracking storage (~500 bytes extra per proposal)
    pub fn member_operations() -> u128 {
        calculate_test_deposit_for_operations(15, 400)
    }

    /// Minimum deposit required for creating proposals (0.1 NEAR)
    /// This is required by the spam prevention mechanism
    pub fn proposal_creation() -> u128 {
        crate::constants::MIN_PROPOSAL_DEPOSIT
    }

    /// Legacy: 10 NEAR (kept for backward compatibility)
    /// Use specific functions above for more accurate deposits
    pub fn legacy_10_near() -> u128 {
        10_000_000_000_000_000_000_000_000
    }
}
