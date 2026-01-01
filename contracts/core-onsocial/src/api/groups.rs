use crate::{state::models::SocialPlatform, SocialError};
use near_sdk::{near, serde_json::Value, AccountId};

use crate::api::guards::{ContractGuards, DepositPolicy, PayableCaller};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    fn execute_payable_group_operation<F, R>(&mut self, operation: F) -> Result<R, SocialError>
    where
        F: FnOnce(&mut SocialPlatform, &AccountId) -> Result<R, SocialError>,
    {
        ContractGuards::execute_payable_operation(
            &mut self.platform,
            PayableCaller::Predecessor,
            DepositPolicy::CreditUpfront {
                reason: "group_operation_deposit",
            },
            |platform, caller, _| operation(platform, caller),
        )
    }

    #[payable]
    #[handle_result]
    pub fn create_group(&mut self, group_id: String, config: Value) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.create_group(group_id, config, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn join_group(&mut self, group_id: String) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| platform.join_group(group_id, caller))
    }

    #[handle_result]
    pub fn leave_group(&mut self, group_id: String) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        let caller = SocialPlatform::current_caller();
        self.platform.leave_group(group_id, &caller)
    }

    #[payable]
    #[handle_result]
    pub fn add_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
        level: u8,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.add_group_member(group_id, member_id, level, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn remove_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.remove_group_member(group_id, member_id, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn approve_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        level: u8,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.approve_join_request(group_id, requester_id, level, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn reject_join_request(
        &mut self,
        group_id: String,
        requester_id: AccountId,
        reason: Option<String>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.reject_join_request(group_id, requester_id, caller, reason)
        })
    }

    #[payable]
    #[handle_result]
    pub fn cancel_join_request(
        &mut self,
        group_id: String,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.cancel_join_request(group_id, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn blacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.blacklist_group_member(group_id, member_id, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn unblacklist_group_member(
        &mut self,
        group_id: String,
        member_id: AccountId,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.unblacklist_group_member(group_id, member_id, caller)
        })
    }

    #[payable]
    #[handle_result]
    pub fn transfer_group_ownership(
        &mut self,
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.transfer_group_ownership(
                group_id,
                new_owner,
                remove_old_owner,
                caller,
            )
        })
    }

    /// Set group privacy.
    #[payable]
    #[handle_result]
    pub fn set_group_privacy(
        &mut self,
        group_id: String,
        is_private: bool,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.set_group_privacy(group_id, is_private, caller)
        })
    }

    /// Create group proposal.
    #[payable]
    #[handle_result]
    pub fn create_group_proposal(
        &mut self,
        group_id: String,
        proposal_type: String,
        changes: Value,
        auto_vote: Option<bool>,
    ) -> Result<String, SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.create_group_proposal(
                group_id,
                proposal_type,
                changes,
                caller,
                auto_vote,
            )
        })
    }

    /// Vote on proposal.
    #[payable]
    #[handle_result]
    pub fn vote_on_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
        approve: bool,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.vote_on_proposal(group_id, proposal_id, approve, caller)
        })
    }

    /// Cancel proposal.
    #[payable]
    #[handle_result]
    pub fn cancel_proposal(
        &mut self,
        group_id: String,
        proposal_id: String,
    ) -> Result<(), SocialError> {
        self.execute_payable_group_operation(|platform, caller| {
            platform.cancel_proposal(group_id, proposal_id, caller)
        })
    }

    // --- Group Query API ---

    /// Group config.
    pub fn get_group_config(&self, group_id: String) -> Option<Value> {
        crate::groups::core::GroupStorage::get_group_config(&self.platform, &group_id)
    }

    /// Member data.
    pub fn get_member_data(&self, group_id: String, member_id: AccountId) -> Option<Value> {
        crate::groups::core::GroupStorage::get_member_data(&self.platform, &group_id, &member_id)
    }

    /// Member check.
    pub fn is_group_member(&self, group_id: String, member_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_member(&self.platform, &group_id, &member_id)
    }

    /// Owner check.
    pub fn is_group_owner(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_owner(&self.platform, &group_id, &user_id)
    }

    /// Blacklist check.
    pub fn is_blacklisted(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::core::GroupStorage::is_blacklisted(&self.platform, &group_id, &user_id)
    }

    /// Join request.
    pub fn get_join_request(&self, group_id: String, requester_id: AccountId) -> Option<Value> {
        crate::groups::core::GroupStorage::get_join_request(&self.platform, &group_id, &requester_id)
    }

    /// Group stats.
    pub fn get_group_stats(&self, group_id: String) -> Option<Value> {
        crate::groups::core::GroupStorage::get_group_stats(&self.platform, &group_id)
    }
}
