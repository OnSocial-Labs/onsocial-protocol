// --- Permission Operations ---
use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Handle API permission grant
    pub(crate) fn handle_api_permission_grant(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let grantee: AccountId = value
            .get("grantee")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("grantee required for permission grant"))?;

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("path required for permission grant"))?;

        let flags: u8 = value
            .get("flags")
            .and_then(|v| v.as_u64())
            .map(|v| v as u8)
            .unwrap_or(1); // Default to WRITE permission

        let expires_at: Option<u64> = value
            .get("expires_at")
            .and_then(|v| v.as_u64());

        self.set_permission(grantee, path.to_string(), flags, expires_at, account_id, Some(event_batch))
    }

    /// Handle API permission revoke
    pub(crate) fn handle_api_permission_revoke(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let grantee: AccountId = value
            .get("grantee")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("grantee required for permission revoke"))?;

        let path = value
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| crate::invalid_input!("path required for permission revoke"))?;

        self.set_permission(grantee, path.to_string(), 0, None, account_id, Some(event_batch))
    }
}