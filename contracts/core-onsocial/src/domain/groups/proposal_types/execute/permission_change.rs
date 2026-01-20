use near_sdk::{
    AccountId, env,
    serde_json::{Value, json},
};

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::domain::groups::GroupStorage;
use crate::domain::groups::config::GroupConfig;
use crate::domain::groups::permissions::kv as kv_permissions;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input};

use super::super::types::ProposalType;
use super::helpers::{ExecutionContext, PathPermissionGrantData};

impl ProposalType {
    pub(super) fn execute_permission_change(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        target_user: &AccountId,
        level: u8,
        reason: Option<&str>,
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        let member_key = GroupStorage::group_member_path(group_id, target_user.as_str());

        let mut member_data = platform
            .storage_get(&member_key)
            .ok_or_else(|| invalid_input!("Member not found"))?;

        if let Some(obj) = member_data.as_object_mut() {
            obj.insert("level".to_string(), json!(level));
            obj.insert(
                "updated_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            );
            if let Some(reason) = reason {
                obj.insert("reason".to_string(), json!(reason));
            }
        }

        platform.storage_set(&member_key, &member_data)?;

        let mut event_batch = EventBatch::new();

        let group_root_path = format!("groups/{}", group_id);
        if level == 0 {
            kv_permissions::revoke_permissions(
                platform,
                proposer,
                target_user,
                &group_root_path,
                &mut event_batch,
            )?;
        } else {
            kv_permissions::grant_permissions(
                platform,
                proposer,
                target_user,
                &group_root_path,
                level,
                None,
                &mut event_batch,
                None,
            )?;
        }

        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "permission_changed",
            proposer.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("proposal_id", proposal_id)
        .with_target(target_user)
        .with_field("level", level)
        .with_field("reason", reason.unwrap_or(""))
        .with_path(&member_key)
        .with_value(member_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub(super) fn execute_path_permission_grant(
        ctx: ExecutionContext,
        proposal_id: &str,
        data: PathPermissionGrantData,
    ) -> Result<(), SocialError> {
        // Granter must be group owner for KV permission keys
        let config = GroupStorage::get_group_config(ctx.platform, ctx.group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner: AccountId = GroupConfig::try_from_value(&config)?.owner;

        let mut event_batch = EventBatch::new();

        kv_permissions::grant_permissions(
            ctx.platform,
            &group_owner,
            data.target_user,
            data.path,
            data.level,
            None,
            &mut event_batch,
            None,
        )?;

        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "path_permission_granted",
            ctx.proposer.clone(),
        )
        .with_field("group_id", ctx.group_id)
        .with_field("proposal_id", proposal_id)
        .with_target(data.target_user)
        .with_path(data.path)
        .with_field("level", data.level)
        .with_field("reason", data.reason)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub(super) fn execute_path_permission_revoke(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        target_user: &AccountId,
        path: &str,
        reason: &str,
        proposer: &AccountId,
    ) -> Result<(), SocialError> {
        // Revoker must be group owner for KV permission keys
        let config = GroupStorage::get_group_config(platform, group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner: AccountId = GroupConfig::try_from_value(&config)?.owner;

        let mut event_batch = EventBatch::new();

        kv_permissions::revoke_permissions(
            platform,
            &group_owner,
            target_user,
            path,
            &mut event_batch,
        )?;

        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "path_permission_revoked",
            proposer.clone(),
        )
        .with_field("group_id", group_id)
        .with_field("proposal_id", proposal_id)
        .with_target(target_user)
        .with_path(path)
        .with_field("reason", reason)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
