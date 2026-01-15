use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    pub(crate) fn handle_api_permission_grant(
        &mut self,
        value: &Value,
        actor_id: &AccountId,
        event_batch: &mut EventBatch,
        attached_balance: &mut u128,
    ) -> Result<(), SocialError> {
        let grantee_str = value
            .get("grantee")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("grantee required for permission grant"))?;

        let grantee: AccountId = crate::validation::parse_account_id_str(
            grantee_str,
            crate::invalid_input!("Invalid grantee account ID"),
        )?;

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("path required for permission grant"))?;

        let level: u8 = value
            .get("level")
            .and_then(|v| v.as_u64())
            .map(|v| v as u8)
            .unwrap_or(1); // WRITE

        let expires_at: Option<u64> = value.get("expires_at").and_then(|v| v.as_u64());

        self.set_permission(
            grantee,
            path.to_string(),
            level,
            expires_at,
            actor_id,
            Some(event_batch),
            Some(attached_balance),
        )
    }

    pub(crate) fn handle_api_permission_revoke(
        &mut self,
        value: &Value,
        actor_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let grantee_str = value
            .get("grantee")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("grantee required for permission revoke"))?;

        let grantee: AccountId = crate::validation::parse_account_id_str(
            grantee_str,
            crate::invalid_input!("Invalid grantee account ID"),
        )?;

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("path required for permission revoke"))?;

        self.set_permission(
            grantee,
            path.to_string(),
            0,
            None,
            actor_id,
            Some(event_batch),
            None,
        )
    }
}
