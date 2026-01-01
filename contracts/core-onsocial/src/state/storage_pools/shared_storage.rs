use near_sdk::AccountId;
use serde_json::Value;

use crate::protocol::set::types::ApiOperationContext;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Handle share storage.
    pub(crate) fn handle_api_share_storage(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        actor_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        if actor_id != account_id {
            return Err(crate::unauthorized!("share_storage", actor_id.as_str()));
        }

        let target_id_str = value
            .get("target_id")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("target_id required for share_storage"))?;

        let target_id: AccountId = crate::validation::parse_account_id_str(
            target_id_str,
            crate::invalid_input!("Invalid target_id account ID"),
        )?;

        if account_id == &target_id {
            return Err(crate::invalid_input!("Cannot share storage with yourself"));
        }

        let max_bytes: u64 = value
            .get("max_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| crate::invalid_input!("max_bytes required for share_storage"))?;

        self.handle_share_storage_atomic(account_id, &target_id, max_bytes, ctx.event_batch)
    }

    /// Handle return shared storage.
    pub(crate) fn handle_api_return_shared_storage(
        &mut self,
        account_id: &AccountId,
        actor_id: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        if actor_id != account_id {
            return Err(crate::unauthorized!("return_shared_storage", actor_id.as_str()));
        }
        self.handle_return_shared_storage_atomic(account_id, ctx.event_batch)
    }
}
