// --- Group Contract API ---
// Public API wrappers for group operations with payable storage handling
//
// This module contains the contract-facing API methods that wrap the internal
// group operations with NEAR-specific concerns like payable deposits and storage refunds.

use near_sdk::{near, AccountId, serde_json::Value, PanicOnDefault};
use crate::{
    config::GovernanceConfig,
    errors::SocialError,
    events::EventConfig,
    state::{models::SocialPlatform, ContractStatus},
};

/// Contract API implementation for group operations
impl crate::Contract {
    /// Allocate storage for an operation (like set method does)
    fn allocate_storage_for_operation(
        &mut self,
        caller: &AccountId,
        attached_balance: &mut u128,
    ) -> Result<(), SocialError> {
        let storage = self.platform.user_storage.get(caller).cloned().unwrap_or_default();
        if *attached_balance > 0 {
            // Allocate attached deposit to storage balance
            let deposit_amount = *attached_balance;

            let mut new_storage = storage;
            new_storage.balance = new_storage.balance.saturating_add(deposit_amount);
            self.platform.user_storage.insert(caller.clone(), new_storage.clone());
            // Reset any active trackers after storing
            new_storage.storage_tracker.reset();

            *attached_balance = attached_balance.saturating_sub(deposit_amount);
        }
        Ok(())
    }

    // --- Group Operations (Payable Wrappers) ---

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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.create_group(group_id, config, &caller);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }

    /// Join a group (unified for both public and private groups)
    #[payable]
    #[handle_result]
    pub fn join_group(
        &mut self,
        group_id: String,
        requested_permissions: u8,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.join_group(group_id, requested_permissions, &caller);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.add_group_member(group_id, member_id, permission_flags, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.remove_group_member(group_id, member_id, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }

    /// Approve a join request with the originally requested permissions
    #[payable]
    #[handle_result]
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.approve_join_request(group_id, requester_id, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.reject_join_request(group_id, requester_id, &caller, reason, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }

    /// Cancel your own join request
    #[payable]
    #[handle_result]
    pub fn cancel_join_request(
        &mut self,
        group_id: String,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.cancel_join_request(group_id, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.blacklist_group_member(group_id, member_id, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.unblacklist_group_member(group_id, member_id, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }

    /// Transfer group ownership (owner only)
    #[payable]
    #[handle_result]
    pub fn transfer_group_ownership(
        &mut self,
        group_id: String,
        new_owner: AccountId,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.transfer_group_ownership(group_id, new_owner, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.set_group_privacy(group_id, is_private, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }

    /// Create a proposal for group changes
    #[payable]
    #[handle_result]
    pub fn create_group_proposal(
        &mut self,
        group_id: String,
        proposal_type: String,
        changes: Value,
        event_config: Option<EventConfig>,
    ) -> Result<String, SocialError> {
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.create_group_proposal(group_id, proposal_type, changes, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
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
        let caller = near_sdk::env::predecessor_account_id();

        // Handle storage deposits like set method
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        self.allocate_storage_for_operation(&caller, &mut attached_balance)?;

        let result = self.platform.vote_on_proposal(group_id, proposal_id, approve, &caller, event_config);

        // Refund unused balance
        if attached_balance > 0 {
            near_sdk::Promise::new(caller)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance));
        }

        result
    }
}