use near_sdk::{AccountId, env, serde_json::{self, Value}};

use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::domain::groups::permissions::kv::types::NONE;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

use super::AddMemberAuth;

impl crate::domain::groups::core::GroupStorage {
    pub fn add_member(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        granter_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::add_member_internal(
            platform,
            group_id,
            member_id,
            granter_id,
            AddMemberAuth::Normal,
        )
    }

    /// New members join with level=NONE; nonce increments to invalidate stale permissions.
    pub fn add_member_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        granter_id: &AccountId,
        auth: AddMemberAuth,
    ) -> Result<(), SocialError> {
        let is_self_join = member_id == granter_id;

        let bypass_permissions = matches!(auth, AddMemberAuth::BypassPermissions);
        let bypass_grant_permission_check = matches!(auth, AddMemberAuth::AlreadyAuthorized);

        let config_path = Self::group_config_path(group_id);
        let config = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group does not exist"))?;

        let cfg = GroupConfig::try_from_value(&config)?;

        let is_private = cfg.is_private.unwrap_or(false);
        let is_public = !is_private;

        let member_path = Self::group_member_path(group_id, member_id.as_str());
        if Self::is_member(platform, group_id, member_id) {
            return Err(invalid_input!("Member already exists in group"));
        }

        if !bypass_permissions && Self::is_blacklisted(platform, group_id, granter_id) {
            if is_self_join {
                return Err(invalid_input!("You are blacklisted from this group"));
            }
            return Err(permission_denied!("add_member", "You are blacklisted from this group"));
        }

        if Self::is_blacklisted(platform, group_id, member_id) {
            return Err(invalid_input!("Cannot add blacklisted user. Remove from blacklist first using unblacklist_group_member."));
        }

        let should_bypass =
            bypass_permissions || (is_self_join && is_public) || bypass_grant_permission_check;

        if !should_bypass && !Self::can_grant_permissions(platform, group_id, granter_id, NONE) {
            return Err(permission_denied!("add_member", &config_path));
        }

        // Nonce scopes permission keys; invalidates stale grants on rejoin.
        let nonce_path = Self::group_member_nonce_path(group_id, member_id.as_str());
        let previous_nonce = platform
            .storage_get(&nonce_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let new_nonce = previous_nonce.saturating_add(1).max(1);
        platform.storage_set(&nonce_path, &Value::Number(new_nonce.into()))?;

        let member_data = Value::Object(serde_json::Map::from_iter([
            ("level".to_string(), Value::Number(NONE.into())),
            (
                "granted_by".to_string(),
                Value::String(granter_id.to_string()),
            ),
            (
                "joined_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
        ]));

        platform.storage_set(&member_path, &member_data)?;

        let group_owner: AccountId = cfg.owner;

        let mut event_batch = EventBatch::new();

        let default_content_path = format!("groups/{}/content", group_id);
        crate::domain::groups::permissions::kv::grant_permissions(
            platform,
            &group_owner,
            member_id,
            &default_content_path,
            crate::domain::groups::permissions::kv::types::WRITE,
            None,
            &mut event_batch,
            None,
        )?;

        Self::increment_member_count(platform, group_id, granter_id, &mut event_batch)?;

        let default_permissions = serde_json::json!([
            {"path": "content", "level": crate::domain::groups::permissions::kv::types::WRITE}
        ]);

        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "add_member",
            granter_id.clone(),
        )
        .with_target(member_id)
        .with_path(&member_path)
        .with_value(member_data)
        .with_field("member_nonce", new_nonce)
        .with_field("member_nonce_path", nonce_path)
        .with_field("default_permissions", default_permissions)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    /// Traditional join: private => join request, public => self-add.
    pub fn join_group_traditional(
        platform: &mut SocialPlatform,
        group_id: &str,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        if Self::is_private_group(platform, group_id) {
            Self::request_join(platform, group_id, caller)
        } else {
            Self::add_member(
                platform,
                group_id,
                caller,
                caller,
            )
        }
    }

    pub fn remove_member(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        remover_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::remove_member_internal(platform, group_id, member_id, remover_id, false)
    }

    pub fn remove_member_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        member_id: &AccountId,
        remover_id: &AccountId,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let member_path = Self::group_member_path(group_id, member_id.as_str());

        let member_entry = platform
            .get_entry(&member_path)
            .filter(|e| matches!(e.value, crate::state::models::DataValue::Value(_)))
            .ok_or_else(|| invalid_input!("Member not found"))?;

        let group_config_path = Self::group_config_path(group_id);

        if !from_governance && member_id != remover_id {
            let op_path = format!("groups/{}/members/{}", group_id, member_id);
            Self::assert_not_member_driven_unless_governance(
                platform,
                group_id,
                from_governance,
                "remove_member",
                &op_path,
            )?;
        }

        let can_remove = if from_governance || member_id == remover_id {
            true
        } else if Self::is_owner(platform, group_id, remover_id) {
            true
        } else {
            let group_owner = crate::domain::groups::permissions::kv::extract_path_owner(platform, &group_config_path)
                .ok_or_else(|| invalid_input!("Group owner not found"))?;

            if crate::domain::groups::permissions::kv::can_manage(
                platform,
                &group_owner,
                remover_id.as_str(),
                &group_config_path,
            ) {
                !Self::is_owner(platform, group_id, member_id)
            } else {
                false
            }
        };

        if !can_remove {
            return Err(permission_denied!(
                "remove_member",
                &format!("groups/{}/members/{}", group_id, member_id)
            ));
        }

        if Self::is_owner(platform, group_id, member_id) {
            return Err(invalid_input!("Owner cannot leave group. Transfer ownership to another member first using transfer_ownership operation."));
        }

        crate::storage::soft_delete_entry(platform, &member_path, member_entry)?;

        let mut event_batch = EventBatch::new();

        Self::decrement_member_count(platform, group_id, remover_id, &mut event_batch)?;

        let is_self_removal = member_id == remover_id;
        let remove_event_data = Value::Object(serde_json::Map::from_iter([
            (
                "removed_by".to_string(),
                Value::String(remover_id.to_string()),
            ),
            (
                "removed_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
            (
                "is_self_removal".to_string(),
                Value::Bool(is_self_removal),
            ),
            (
                "from_governance".to_string(),
                Value::Bool(from_governance),
            ),
        ]));
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "remove_member",
            remover_id.clone(),
        )
        .with_target(member_id)
        .with_path(&format!("groups/{}/members/{}", group_id, member_id))
        .with_value(Value::Null)
        .with_structured_data(remove_event_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
