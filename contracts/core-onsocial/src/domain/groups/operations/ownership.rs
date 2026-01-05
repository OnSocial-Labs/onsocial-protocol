use near_sdk::{
    env,
    serde_json::Value,
    AccountId,
};

use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

impl crate::domain::groups::core::GroupStorage {
    pub fn transfer_ownership_with_removal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        remove_old_owner: Option<bool>,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);
        let config_data = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group not found"))?;
        let old_owner = GroupConfig::try_from_value(&config_data)?.owner;

        Self::transfer_ownership_internal(platform, group_id, new_owner, caller, false)?;

        let should_remove = remove_old_owner.unwrap_or(true);
        if should_remove && old_owner != *new_owner {
            Self::remove_member(platform, group_id, &old_owner, new_owner)?;
        }

        Ok(())
    }

    pub fn transfer_ownership_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        caller: &AccountId,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);
        let config_data = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group not found"))?;

        let cfg = GroupConfig::try_from_value(&config_data)?;
        let current_owner = cfg.owner;

        if current_owner == *new_owner {
            return Err(invalid_input!("Cannot transfer ownership to yourself"));
        }

        if !from_governance {
            if cfg.member_driven {
                return Err(permission_denied!("transfer_ownership", &config_path));
            }

            if current_owner != *caller {
                return Err(permission_denied!("transfer_ownership", &config_path));
            }
        }

        if !Self::is_member(platform, group_id, new_owner) {
            return Err(invalid_input!("New owner must be a member of the group"));
        }

        if Self::is_blacklisted(platform, group_id, new_owner) {
            return Err(invalid_input!("Cannot transfer ownership to blacklisted member"));
        }

        let mut config_data = config_data;
        let transfer_timestamp = env::block_timestamp();

        let obj = config_data.as_object_mut()
            .ok_or_else(|| invalid_input!("Group config is not a valid JSON object"))?;
        obj.insert("owner".to_string(), Value::String(new_owner.to_string()));
        obj.insert(
            "ownership_transferred_at".to_string(),
            Value::String(transfer_timestamp.to_string()),
        );
        obj.insert(
            "previous_owner".to_string(),
            Value::String(current_owner.to_string()),
        );

        platform.storage_set(&config_path, &config_data)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "transfer_ownership",
            current_owner.clone(),
        )
        .with_target(new_owner)
        .with_field("group_id", group_id)
        .with_field("new_owner", new_owner.as_str())
        .with_field("previous_owner", current_owner.as_str())
        .with_field("transferred_at", transfer_timestamp.to_string())
        .with_field("triggered_by", caller.as_str())
        .with_field("from_governance", from_governance)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
