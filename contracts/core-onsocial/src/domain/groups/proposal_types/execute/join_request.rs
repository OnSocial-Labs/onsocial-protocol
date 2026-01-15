use near_sdk::AccountId;

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::members::AddMemberAuth;
use crate::domain::groups::GroupStorage;
use crate::domain::groups::permissions::kv as kv_permissions;
use crate::state::models::SocialPlatform;
use crate::SocialError;

use super::super::types::ProposalType;

impl ProposalType {
    pub(super) fn execute_join_request(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        requester: &AccountId,
        message: Option<&str>,
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        if GroupStorage::is_blacklisted(platform, group_id, requester) {
            return Err(crate::permission_denied!("execute_join_request", "Requester was blacklisted"));
        }

        GroupStorage::add_member_internal(
            platform,
            group_id,
            requester,
            proposer,
            AddMemberAuth::BypassPermissions,
        )?;

        let member_nonce_path = format!("groups/{}/member_nonces/{}", group_id, requester);
        let member_nonce = platform.storage_get(&member_nonce_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "join_request_approved", proposer.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_target(requester)
            .with_path(&format!("groups/{}/members/{}", group_id, requester))
            .with_field("level", kv_permissions::types::NONE)
            .with_field("message", message)
            .with_field("member_nonce", member_nonce)
            .with_field("member_nonce_path", member_nonce_path.as_str())
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
