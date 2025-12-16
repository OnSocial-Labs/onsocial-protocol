// --- Imports ---
use crate::{
    config::GovernanceConfig,
    errors::SocialError,
    events::EventConfig,
    state::{models::SocialPlatform, ContractStatus},
};
use near_sdk::ext_contract;
use near_sdk::{
    near,
    serde_json::Value,
    AccountId, PanicOnDefault,
};

mod config;
pub mod constants;
mod data;
mod errors;
mod events;
mod groups;
mod state;
mod status;
mod storage;
mod utils;
mod validation;

// --- Re-exports ---
pub use state::SetOptions;

// --- Permission Types ---
// (Removed - simplified to inline logic)

// #[cfg(feature = "unit-testing")]
// mod tests;

#[cfg(test)]
mod tests;

// --- Structs ---

/// Platform pool information for universal storage sponsorship
#[derive(
    near_sdk_macros::NearSchema,
    near_sdk::serde::Serialize,
    near_sdk::serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct PlatformPoolInfo {
    /// Total NEAR deposited in the pool (yoctoNEAR)
    pub storage_balance: u128,
    /// Total storage capacity in bytes
    pub total_bytes: u64,
    /// Currently used storage in bytes
    pub used_bytes: u64,
    /// Total bytes allocated to specific users (for shared storage allocations)
    pub shared_bytes: u64,
    /// Available bytes for new operations
    pub available_bytes: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    platform: SocialPlatform,
}

// --- Ext Contract Trait ---
#[ext_contract(ext_social)]
pub trait SocialContractExt {
    #[payable]
    #[handle_result]
    fn set(
        &mut self,
        operations: Vec<(String, Value, Option<String>)>,
        event_config: Option<EventConfig>,
    ) -> Result<(Vec<String>, Vec<SocialError>), SocialError>;

    #[payable]
    #[handle_result]
    fn set_for(
        &mut self,
        target_account: AccountId,
        operations: Vec<(String, Value, Option<String>)>,
        event_config: Option<EventConfig>,
    ) -> Result<(Vec<String>, Vec<SocialError>), SocialError>;

    fn get(
        &self,
        patterns: Vec<String>,
        account_id: Option<AccountId>,
        block_height: Option<u64>,
        limit: Option<usize>,
        offset: Option<usize>,
        include_metadata: Option<bool>,
    ) -> std::collections::HashMap<String, Value>;

    fn get_config(&self) -> GovernanceConfig;
    fn get_contract_status(&self) -> ContractStatus;
    fn get_storage_balance(&self, account_id: AccountId) -> Option<crate::storage::Storage>;

    /// Check if grantee has permission for a path
    fn has_permission(
        &self,
        owner: AccountId,
        grantee: AccountId,
        path: String,
        permission_flags: u8,
    ) -> bool;
}

// --- Public API ---
#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            platform: SocialPlatform::new(),
        }
    }

    /// Enter read-only mode. Returns true if state changed.
    #[payable]
    pub fn enter_read_only(&mut self) -> bool {
        crate::status::enter_read_only(&mut self.platform)
    }

    /// Resume live (writable) mode. Returns true if state changed.
    #[payable]
    pub fn resume_live(&mut self) -> bool {
        crate::status::resume_live(&mut self.platform)
    }

    /// Activate contract from Genesis to Live mode (one-time operation). Returns true if state changed.
    #[payable]
    pub fn activate_contract(&mut self) -> bool {
        crate::status::activate_contract(&mut self.platform)
    }

    #[payable]
    #[handle_result]
    pub fn set(
        &mut self,
        data: Value,
        options: Option<crate::SetOptions>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.platform.set(data, options, event_config)
    }

    #[payable]
    #[handle_result]
    pub fn set_for(
        &mut self,
        target_account: AccountId,
        data: Value,
        options: Option<crate::SetOptions>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.platform.set_for(target_account, data, options, event_config)
    }

    pub fn get(
        &self,
        keys: Vec<String>,
        account_id: Option<AccountId>,
        data_type: Option<String>,
        include_metadata: Option<bool>,
    ) -> std::collections::HashMap<String, Value> {
        self.platform.get(keys, account_id, data_type, include_metadata)
    }

    pub fn get_storage_balance(&self, account_id: AccountId) -> Option<crate::storage::Storage> {
        self.platform.get_account_storage(account_id.as_str())
    }

    /// Get the platform storage pool status (the pool used for universal storage sponsorship)
    /// Returns None if the pool hasn't been funded yet
    pub fn get_platform_pool(&self) -> Option<PlatformPoolInfo> {
        self.platform.shared_storage_pools.get(&self.platform.manager).map(|pool| {
            let total_capacity_bytes = (pool.storage_balance / near_sdk::env::storage_byte_cost().as_yoctonear()) as u64;
            PlatformPoolInfo {
                storage_balance: pool.storage_balance,
                total_bytes: total_capacity_bytes,
                used_bytes: pool.used_bytes,
                shared_bytes: pool.shared_bytes,
                available_bytes: total_capacity_bytes.saturating_sub(pool.used_bytes),
            }
        })
    }

    pub fn get_contract_status(&self) -> ContractStatus {
        self.platform.status
    }

    pub fn get_config(&self) -> GovernanceConfig {
        self.platform.config.clone()
    }

    /// Update governance configuration (manager only)
    /// Used to adjust safety limits and platform settings
    #[handle_result]
    pub fn update_config(&mut self, config: GovernanceConfig) -> Result<(), SocialError> {
        // Only manager can update config
        let caller = near_sdk::env::predecessor_account_id();
        if caller != self.platform.manager {
            return Err(crate::unauthorized!("update_config", caller.to_string()));
        }
        
        // Validate config update (only allow increases for safety limits)
        if let Err(msg) = config.validate_update(&self.platform.config) {
            return Err(crate::invalid_input!(msg));
        }
        
        self.platform.config = config;
        Ok(())
    }

    pub fn has_permission(
        &self,
        owner: AccountId,
        grantee: AccountId,
        path: String,
        permission_flags: u8,
    ) -> bool {
        crate::groups::kv_permissions::has_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
            permission_flags,
        )
    }

    /// Get permission flags for a user on a specific path
    /// Returns: u8 bitwise flags (WRITE=1, MODERATE=2, MANAGE=4)
    /// Useful for UIs to check write capabilities before showing actions
    pub fn get_permissions(
        &self,
        owner: AccountId,
        grantee: AccountId,
        path: String,
    ) -> u8 {
        crate::groups::kv_permissions::get_user_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
        )
    }

    // --- Ultra-Simple Unified Permission System ---

    /// Set permission for a path (grant or revoke in one call)
    /// Automatically detects permission type:
    /// - Paths with "/" are treated as directory permissions
    /// - Account IDs (alice.near) are treated as account-level directory permissions
    /// - Other paths are treated as exact permissions
    /// permission_flags = 0 means revoke, > 0 means grant
    /// 
    /// SECURITY: Uses signer_account_id() to ensure only the transaction signer
    /// can grant/revoke permissions, preventing intermediary contracts from
    /// granting permissions on behalf of users.
    #[handle_result]
    pub fn set_permission(
        &mut self,
        grantee: AccountId,
        path: String,
        permission_flags: u8,
        expires_at: Option<u64>,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::signer_account_id();
        self.platform.set_permission(grantee, path, permission_flags, expires_at, &caller, None)
    }

    // --- Group Query API ---

    /// Get group configuration
    pub fn get_group_config(&self, group_id: String) -> Option<Value> {
        crate::groups::core::GroupStorage::get_group_config(&self.platform, &group_id)
    }

    /// Get member data for a specific user in a group
    pub fn get_member_data(&self, group_id: String, member_id: AccountId) -> Option<Value> {
        crate::groups::core::GroupStorage::get_member_data(&self.platform, &group_id, &member_id)
    }

    /// Check if a user is a member of a group
    pub fn is_group_member(&self, group_id: String, member_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_member(&self.platform, &group_id, &member_id)
    }

    /// Check if a user is the owner of a group
    pub fn is_group_owner(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_owner(&self.platform, &group_id, &user_id)
    }

    /// Check if a user is blacklisted from a group
    pub fn is_blacklisted(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_blacklisted(&self.platform, &group_id, &user_id)
    }

    /// Get join request data for a specific user
    pub fn get_join_request(&self, group_id: String, requester_id: AccountId) -> Option<Value> {
        crate::groups::core::GroupStorage::get_join_request(&self.platform, &group_id, &requester_id)
    }

    /// Get group statistics (member counts, etc.)
    pub fn get_group_stats(&self, group_id: String) -> Option<Value> {
        crate::groups::core::GroupStorage::get_group_stats(&self.platform, &group_id)
    }

    /// Check if a user has admin permissions for a group (MANAGE flag)
    pub fn has_group_admin_permission(&self, group_id: String, user_id: AccountId) -> bool {
        let group_config_path = format!("groups/{}/config", group_id);
        crate::groups::kv_permissions::can_manage(&self.platform, &group_id, user_id.as_str(), &group_config_path)
    }

    /// Check if a user has moderator permissions for a group (MODERATE flag)
    pub fn has_group_moderate_permission(&self, group_id: String, user_id: AccountId) -> bool {
        let group_config_path = format!("groups/{}/config", group_id);
        if let Some(group_owner) = crate::groups::kv_permissions::extract_path_owner(&self.platform, &group_config_path) {
            crate::groups::kv_permissions::can_moderate(&self.platform, &group_owner, user_id.as_str(), &group_config_path)
        } else {
            false
        }
    }

    // --- Governance Query API ---

    /// Get proposal data by ID (O(1) direct lookup)
    pub fn get_proposal(&self, group_id: String, proposal_id: String) -> Option<Value> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        self.platform.storage_get(&proposal_path)
    }

    /// Get vote tally for a proposal (O(1) direct lookup)
    pub fn get_proposal_tally(&self, group_id: String, proposal_id: String) -> Option<Value> {
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);
        self.platform.storage_get(&tally_path)
    }

    /// Get individual vote record (O(1) direct lookup)
    pub fn get_vote(&self, group_id: String, proposal_id: String, voter: AccountId) -> Option<Value> {
        let vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, voter);
        self.platform.storage_get(&vote_path)
    }

}

// --- Group Operations (Payable Wrappers) ---
// These methods handle payable storage deposits and delegate to the platform

#[near]
impl Contract {
    /// Execute a payable group operation with automatic storage handling
    fn execute_payable_group_operation<F, R>(
        &mut self,
        operation: F,
    ) -> Result<R, SocialError> 
    where
        F: FnOnce(&mut SocialPlatform, &AccountId) -> Result<R, SocialError>,
    {
        let caller = near_sdk::env::predecessor_account_id();
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        
        // Allocate storage deposit
        if attached_balance > 0 {
            let original_balance = attached_balance;
            let storage = self.platform.user_storage.get(&caller).cloned().unwrap_or_default();
            let mut new_storage = storage;
            new_storage.balance = new_storage.balance.saturating_add(attached_balance);
            self.platform.user_storage.insert(caller.clone(), new_storage.clone());
            new_storage.storage_tracker.reset();
            attached_balance = 0; // All allocated
            near_sdk::env::log_str(&format!("DEBUG: Allocated {} yoctoNEAR to storage for {}", original_balance, caller));
        }
        
        // Execute operation
        let result = operation(&mut self.platform, &caller)?;
        
        // Refund unused balance (should be 0 after proper allocation)
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance))
                .detach();
        }
        
        Ok(result)
    }

    /// Create a new group
    /// For member-driven groups, set member_driven: true in config
    /// Example: {"member_driven": true, "is_private": false}
    #[payable]
    #[handle_result]
    pub fn create_group(
        &mut self,
        group_id: String,
        config: Value,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.create_group(group_id, config, caller)
        })
    }

    /// Join a group (unified for both public and private groups)
    #[payable]
    #[handle_result]
    pub fn join_group(
        &mut self,
        group_id: String,
        requested_permissions: u8,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.join_group(group_id, requested_permissions, caller)
        })
    }

    /// Leave a group (removes caller from group)
    #[handle_result]
    pub fn leave_group(
        &mut self,
        group_id: String,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::predecessor_account_id();
        self.platform.leave_group(group_id, &caller)
    }

    /// Add a member to a group with specific permissions
    #[payable]
    #[handle_result]
    pub fn add_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        permission_flags: u8,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.add_group_member(group_id, member_id, permission_flags, caller, event_config)
        })
    }

    /// Remove a member from a group (admin/moderator only)
    #[payable]
    #[handle_result]
    pub fn remove_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.remove_group_member(group_id, member_id, caller, event_config)
        })
    }

    /// Approve a join request with the originally requested permissions
    #[payable]
    #[handle_result]
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        permission_flags: u8,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.approve_join_request(group_id, requester_id, permission_flags, caller, event_config)
        })
    }

    /// Reject a join request (admin/moderator only)
    #[payable]
    #[handle_result]
    pub fn reject_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        reason: Option<String>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.reject_join_request(group_id, requester_id, caller, reason, event_config)
        })
    }

    /// Cancel your own join request
    #[payable]
    #[handle_result]
    pub fn cancel_join_request(
        &mut self,
        group_id: String,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.cancel_join_request(group_id, caller, event_config)
        })
    }

    /// Add user to group blacklist (admin only)
    #[payable]
    #[handle_result]
    pub fn blacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.blacklist_group_member(group_id, member_id, caller, event_config)
        })
    }

    /// Remove user from group blacklist (admin only)
    #[payable]
    #[handle_result]
    pub fn unblacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.unblacklist_group_member(group_id, member_id, caller, event_config)
        })
    }

    /// Transfer group ownership (owner only)
    /// 
    /// # Parameters
    /// * `remove_old_owner` - Whether to remove the old owner from group membership (default: true for clean transitions)
    #[payable]
    #[handle_result]
    pub fn transfer_group_ownership(
        &mut self,
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.transfer_group_ownership(group_id, new_owner, remove_old_owner, caller, event_config)
        })
    }

    /// Set group privacy (private/public) - owner only
    #[payable]
    #[handle_result]
    pub fn set_group_privacy(
        &mut self,
        group_id: String,
        is_private: bool,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.set_group_privacy(group_id, is_private, caller, event_config)
        })
    }

    /// Create a proposal for group changes
    /// 
    /// # Arguments
    /// * `auto_vote` - Whether proposer automatically votes YES. Default is true (None = true).
    ///                 Set to Some(false) for discussion-first proposals where proposer votes later.
    #[payable]
    #[handle_result]
    pub fn create_group_proposal(
        &mut self,
        group_id: String,
        proposal_type: String,
        changes: Value,
        event_config: Option<EventConfig>,
        auto_vote: Option<bool>,
    ) -> Result<String, SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.create_group_proposal(group_id, proposal_type, changes, caller, event_config, auto_vote)
        })
    }

    /// Vote on a proposal
    #[payable]
    #[handle_result]
    pub fn vote_on_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
        approve: bool,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.vote_on_proposal(group_id, proposal_id, approve, caller, event_config)
        })
    }

}
