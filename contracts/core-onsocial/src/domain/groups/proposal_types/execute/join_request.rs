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
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        if GroupStorage::is_blacklisted(platform, group_id, executor) {
            return Err(crate::permission_denied!("execute_join_request", "Proposer was blacklisted"));
        }

        GroupStorage::add_member_internal(
            platform,
            group_id,
            requester,
            executor,
            AddMemberAuth::BypassPermissions,
        )?;

        // Emit join request approved event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "join_request_approved", executor.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_target(requester)
            .with_path(&format!("groups/{}/join_requests/{}", group_id, requester))
            .with_field("level", kv_permissions::types::NONE)
            .with_field("message", message)
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
