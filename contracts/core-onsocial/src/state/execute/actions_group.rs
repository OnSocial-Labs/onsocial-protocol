use near_sdk::AccountId;
use near_sdk::serde_json::Value;

use crate::SocialError;
use crate::state::execute::ExecuteContext;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    fn prepare_group_storage(&mut self, ctx: &mut ExecuteContext) {
        if ctx.attached_balance > 0 {
            self.credit_storage_balance(&ctx.actor_id, ctx.attached_balance);
            ctx.attached_balance = 0;
        }
        self.set_execution_payer(ctx.actor_id.clone());
    }

    fn cleanup_group_storage(&mut self) {
        self.clear_execution_payer();
    }

    pub(super) fn execute_action_create_group(
        &mut self,
        group_id: &str,
        config: Value,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.create_group(group_id.to_string(), config, &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_join_group(
        &mut self,
        group_id: &str,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.join_group(group_id.to_string(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_leave_group(
        &mut self,
        group_id: &str,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.leave_group(group_id.to_string(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_add_member(
        &mut self,
        group_id: &str,
        member_id: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.add_group_member(group_id.to_string(), member_id.clone(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_remove_member(
        &mut self,
        group_id: &str,
        member_id: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result =
            self.remove_group_member(group_id.to_string(), member_id.clone(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_approve_join(
        &mut self,
        group_id: &str,
        requester_id: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result =
            self.approve_join_request(group_id.to_string(), requester_id.clone(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_reject_join(
        &mut self,
        group_id: &str,
        requester_id: &AccountId,
        reason: Option<&str>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.reject_join_request(
            group_id.to_string(),
            requester_id.clone(),
            &ctx.actor_id,
            reason.map(|s| s.to_string()),
        );
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_cancel_join(
        &mut self,
        group_id: &str,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.cancel_join_request(group_id.to_string(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_blacklist(
        &mut self,
        group_id: &str,
        member_id: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result =
            self.blacklist_group_member(group_id.to_string(), member_id.clone(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_unblacklist(
        &mut self,
        group_id: &str,
        member_id: &AccountId,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result =
            self.unblacklist_group_member(group_id.to_string(), member_id.clone(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_transfer_ownership(
        &mut self,
        group_id: &str,
        new_owner: &AccountId,
        remove_old_owner: Option<bool>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.transfer_group_ownership(
            group_id.to_string(),
            new_owner.clone(),
            remove_old_owner,
            &ctx.actor_id,
        );
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_set_privacy(
        &mut self,
        group_id: &str,
        is_private: bool,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.set_group_privacy(group_id.to_string(), is_private, &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_create_proposal(
        &mut self,
        group_id: &str,
        proposal_type: &str,
        changes: Value,
        auto_vote: Option<bool>,
        description: Option<String>,
        ctx: &mut ExecuteContext,
    ) -> Result<String, SocialError> {
        self.prepare_group_storage(ctx);

        let available = self
            .user_storage
            .get(&ctx.actor_id)
            .map(|s| s.available_balance())
            .unwrap_or(0);

        if available < crate::constants::MIN_PROPOSAL_DEPOSIT {
            return Err(crate::invalid_input!(
                "Minimum 0.1 NEAR in storage balance required to create a proposal"
            ));
        }

        let result = self.create_group_proposal(
            group_id.to_string(),
            proposal_type.to_string(),
            changes,
            &ctx.actor_id,
            auto_vote,
            description,
        );
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_vote(
        &mut self,
        group_id: &str,
        proposal_id: &str,
        approve: bool,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result = self.vote_on_proposal(
            group_id.to_string(),
            proposal_id.to_string(),
            approve,
            &ctx.actor_id,
        );
        self.cleanup_group_storage();
        result
    }

    pub(super) fn execute_action_cancel_proposal(
        &mut self,
        group_id: &str,
        proposal_id: &str,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_group_storage(ctx);
        let result =
            self.cancel_proposal(group_id.to_string(), proposal_id.to_string(), &ctx.actor_id);
        self.cleanup_group_storage();
        result
    }
}
