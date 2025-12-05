// --- Test Utilities ---
#[cfg(test)]
use crate::*;
#[cfg(test)]
use near_sdk::test_utils::{accounts, VMContextBuilder};
#[cfg(test)]
use near_sdk::{AccountId, NearToken, env};
use crate::events::Event;
use near_sdk::base64::Engine;

/// Realistic base timestamp for tests (October 1, 2025 00:00:00 UTC in nanoseconds)
/// This matches the current date and is realistic for NEAR blockchain operations
#[cfg(test)]
pub const TEST_BASE_TIMESTAMP: u64 = 1727740800000000000;

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
pub fn get_context_with_deposit(predecessor_account_id: AccountId, deposit: u128) -> VMContextBuilder {
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

/// Initialize a live contract for testing
#[cfg(test)]
pub fn init_live_contract() -> Contract {
    let mut contract = Contract::new();
    // Transition to live mode for testing
    contract.platform.status = crate::state::models::ContractStatus::Live;
    contract
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
    permission_flags: u8,
    added_by: &AccountId,
) {
    test_add_member_bypass_proposals_with_timestamp(contract, group_id, member_id, permission_flags, added_by, env::block_timestamp());
}

/// Helper to add test members with specific joined_at timestamp
#[cfg(test)]
pub fn test_add_member_bypass_proposals_with_timestamp(
    contract: &mut crate::Contract,
    group_id: &str,
    member_id: &AccountId,
    permission_flags: u8,
    added_by: &AccountId,
    joined_at: u64,
) {
    use near_sdk::env;
    use near_sdk::serde_json::json;
    
    // Add member data directly (test-only bypass)
    let member_data = json!({
        "permission_flags": permission_flags,
        "joined_at": joined_at,
        "added_by": added_by.as_str(),
        "is_creator": false
    });
    contract.platform.storage_set(
        &format!("groups/{}/members/{}", group_id, member_id.as_str()), 
        &member_data
    ).expect("Test setup: failed to add member");

    // Update member count
    let stats_key = format!("groups/{}/stats", group_id);
    let mut stats = contract.platform.storage_get(&stats_key)
        .unwrap_or_else(|| json!({"total_members": 1, "created_at": env::block_timestamp()}));
    
    if let Some(obj) = stats.as_object_mut() {
        let current_count = obj.get("total_members").and_then(|v| v.as_u64()).unwrap_or(1);
        obj.insert("total_members".to_string(), json!(current_count + 1));
        obj.insert("last_updated".to_string(), json!(env::block_timestamp()));
    }
    
    contract.platform.storage_set(&stats_key, &stats)
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
        crate::storage::soft_delete_entry(&mut contract.platform, &member_path, entry)
            .expect("Test setup: failed to soft delete member");
    }

    // Update member count
    let stats_key = format!("groups/{}/stats", group_id);
    if let Some(mut stats) = contract.platform.storage_get(&stats_key) {
        if let Some(obj) = stats.as_object_mut() {
            let current_count = obj.get("total_members").and_then(|v| v.as_u64()).unwrap_or(0);
            obj.insert("total_members".to_string(), json!(current_count.saturating_sub(1)));
            obj.insert("last_updated".to_string(), json!(env::block_timestamp()));
            contract.platform.storage_set(&stats_key, &stats)
                .expect("Test setup: failed to update stats");
        }
    }
}

/// Decode and verify contract events from logs
#[cfg(test)]
pub fn verify_contract_event(log: &str, expected_operation: &str, expected_prev_status: &str, expected_new_status: &str) -> bool {
    if !log.starts_with("EVENT:") {
        return false;
    }

    // Extract base64 part after "EVENT:"
    let base64_data = &log[6..]; // Skip "EVENT:" prefix

    // Decode base64
    let decoded = match near_sdk::base64::engine::general_purpose::STANDARD.decode(base64_data) {
        Ok(data) => data,
        Err(_) => return false,
    };

    // Deserialize Borsh event
    let event: Event = match borsh::BorshDeserialize::deserialize(&mut decoded.as_slice()) {
        Ok(event) => event,
        Err(_) => return false,
    };

    // Check event type and operation
    if event.evt_type != "CONTRACT_UPDATE" {
        return false;
    }

    if event.op_type != expected_operation {
        return false;
    }

    // Check extra data contains the expected status transition
    if let Some(ref data) = event.data {
        let mut found_previous = false;
        let mut found_new = false;

        for extra in &data.extra {
            match extra.key.as_str() {
                "previous" => {
                    if let crate::events::types::BorshValue::String(ref status) = extra.value {
                        if status.contains(expected_prev_status) {
                            found_previous = true;
                        }
                    }
                }
                "new" => {
                    if let crate::events::types::BorshValue::String(ref status) = extra.value {
                        if status.contains(expected_new_status) {
                            found_new = true;
                        }
                    }
                }
                _ => {}
            }
        }

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
    pub fn member_operations() -> u128 {
        calculate_test_deposit_for_operations(10, 300)
    }
    
    /// Legacy: 10 NEAR (kept for backward compatibility)
    /// Use specific functions above for more accurate deposits
    pub fn legacy_10_near() -> u128 {
        10_000_000_000_000_000_000_000_000
    }
}