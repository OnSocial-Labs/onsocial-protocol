use near_sdk::json_types::U64;
use near_sdk::{AccountId, PublicKey};

use crate::SocialError;
use crate::state::execute::ExecuteContext;
use crate::state::models::SocialPlatform;
use crate::state::permissions::{SetKeyPermission, SetPermission};

impl SocialPlatform {
    fn prepare_permission_storage(&mut self, ctx: &mut ExecuteContext) {
        self.set_execution_payer(ctx.actor_id.clone());
    }

    fn cleanup_permission_storage(&mut self) {
        self.clear_execution_payer();
    }

    pub(super) fn execute_action_set_permission(
        &mut self,
        grantee: &AccountId,
        path: &str,
        level: u8,
        expires_at: Option<U64>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_permission_storage(ctx);
        let perm = SetPermission {
            grantee: grantee.clone(),
            path: path.to_string(),
            level,
            expires_at: expires_at.map(|v| v.0),
            caller: &ctx.actor_id,
        };
        let result = self.set_permission(perm, None, Some(&mut ctx.attached_balance));
        self.cleanup_permission_storage();
        result
    }

    pub(super) fn execute_action_set_key_permission(
        &mut self,
        public_key: &PublicKey,
        path: &str,
        level: u8,
        expires_at: Option<U64>,
        ctx: &mut ExecuteContext,
    ) -> Result<(), SocialError> {
        self.prepare_permission_storage(ctx);
        let perm = SetKeyPermission {
            public_key: public_key.clone(),
            path: path.to_string(),
            level,
            expires_at: expires_at.map(|v| v.0),
            caller: &ctx.actor_id,
        };
        let result = self.set_key_permission(perm, None, Some(&mut ctx.attached_balance));
        self.cleanup_permission_storage();
        result
    }
}
