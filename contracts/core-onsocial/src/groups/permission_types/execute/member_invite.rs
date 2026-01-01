use near_sdk::AccountId;

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::events::{EventBatch, EventBuilder};
use crate::groups::members::AddMemberAuth;
use crate::groups::{kv_permissions, GroupStorage};
use crate::state::models::SocialPlatform;
use crate::SocialError;

use super::super::types::ProposalType;

impl ProposalType {
    pub(super) fn execute_member_invite(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        target_user: &AccountId,
        message: Option<&str>,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        // Clean add semantics: invites add as member-only; role grants are explicit via PermissionChange.
        GroupStorage::add_member_internal(
            platform,
            group_id,
            target_user,
            executor,
            kv_permissions::NONE,
            AddMemberAuth::BypassPermissions,
        )?;

        // Emit additional invite event
        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "member_invited", executor.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_target(target_user)
            .with_field("level", kv_permissions::NONE)
            .with_field("message", message)
            .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
