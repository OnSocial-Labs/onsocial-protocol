use near_sdk::{
    AccountId,
    env,
    serde_json::{json, Value},
};

use crate::constants::EVENT_TYPE_GROUP_UPDATE;
use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::domain::groups::{kv_permissions, GroupStorage};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, SocialError};

use super::helpers::{ExecutionContext, PathPermissionGrantData};
use super::super::types::ProposalType;

impl ProposalType {
    pub(super) fn execute_permission_change(
        platform: &mut SocialPlatform,
        group_id: &str,
        proposal_id: &str,
        target_user: &AccountId,
        level: u8,
        reason: Option<&str>,
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        let member_key = GroupStorage::group_member_path(group_id, target_user.as_str());

        // Read existing member data to preserve joined_at, granted_by, is_creator
        let mut member_data = platform
            .storage_get(&member_key)
            .ok_or_else(|| invalid_input!("Member not found"))?;

        // Update only the permission-related fields, preserving original membership data
        if let Some(obj) = member_data.as_object_mut() {
            obj.insert("level".to_string(), json!(level));
            obj.insert("updated_at".to_string(), Value::String(env::block_timestamp().to_string()));
            obj.insert("updated_by".to_string(), json!(executor.to_string()));
            if let Some(reason) = reason {
                obj.insert("reason".to_string(), json!(reason));
            }
        }

        platform.storage_set(&member_key, &member_data)?;

        let mut event_batch = EventBatch::new();

        // Apply the global (group-root) permission change.
        let group_root_path = format!("groups/{}", group_id);
        if level == 0 {
            kv_permissions::revoke_permissions(platform, executor, target_user, &group_root_path, &mut event_batch)?;
        } else {
            kv_permissions::grant_permissions(
                platform,
                executor,
                target_user,
                &group_root_path,
                level,
                None,
                &mut event_batch,
                None,
            )?;
        }

        // Emit event
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "permission_changed", executor.clone())
            .with_field("group_id", group_id)
            .with_field("proposal_id", proposal_id)
            .with_target(target_user)
            .with_field("level", level)
            .with_field("reason", reason)
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
        // Get the group owner (permissions are granted by the group owner, not the group_id)
        let config = GroupStorage::get_group_config(ctx.platform, ctx.group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner: AccountId = GroupConfig::try_from_value(&config)?.owner;

        let mut event_batch = EventBatch::new();

        // Grant the path permission using the KV permissions system (with group owner as granter)
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

        // Emit event
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "path_permission_granted", ctx.executor.clone())
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
        executor: &AccountId,
    ) -> Result<(), SocialError> {
        // Get the group owner (permissions are revoked by the group owner, not the group_id)
        let config = GroupStorage::get_group_config(platform, group_id)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let group_owner: AccountId = GroupConfig::try_from_value(&config)?.owner;

        let mut event_batch = EventBatch::new();

        // Revoke the path permission using the KV permissions system (with group owner as revoker)
        kv_permissions::revoke_permissions(platform, &group_owner, target_user, path, &mut event_batch)?;

        // Emit event
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "path_permission_revoked", executor.clone())
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
