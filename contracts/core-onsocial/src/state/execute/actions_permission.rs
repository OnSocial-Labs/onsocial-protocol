use near_sdk::json_types::U64;
use near_sdk::{AccountId, PublicKey};

use crate::state::execute::ExecuteContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(super) fn execute_action_set_permission(
        &mut self,
        grantee: &AccountId,
        path: &str,
        level: u8,
        expires_at: Option<U64>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.set_permission(
            grantee.clone(),
            path.to_string(),
            level,
            expires_at.map(|v| v.0),
            &ctx.actor_id,
            None,
            Some(&mut ctx.attached_balance),
        )
    }

    pub(super) fn execute_action_set_key_permission(
        &mut self,
        public_key: &PublicKey,
        path: &str,
        level: u8,
        expires_at: Option<U64>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.set_key_permission(
            public_key.clone(),
            path.to_string(),
            level,
            expires_at.map(|v| v.0),
            &ctx.actor_id,
            None,
            Some(&mut ctx.attached_balance),
        )
    }
}
