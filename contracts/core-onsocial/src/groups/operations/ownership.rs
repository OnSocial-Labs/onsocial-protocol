use near_sdk::{
    env,
    serde_json::Value,
    AccountId,
};

use crate::events::{EventBatch, EventBuilder};
use crate::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

impl crate::groups::core::GroupStorage {
    pub fn transfer_ownership_with_removal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        remove_old_owner: Option<bool>,
    ) -> Result<(), SocialError> {
        // Get the current owner before transfer (like governance does)
        let config_path = Self::group_config_path(group_id);
        let config = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group config not found"))?;
        let old_owner = GroupConfig::try_from_value(&config)
            .map_err(|_| invalid_input!("Current owner not found"))?
            .owner;

        // First transfer ownership using existing method
        Self::transfer_ownership_internal(platform, group_id, new_owner, false)?;

        // Then handle member removal if requested (default: true for clean transitions)
        let should_remove = remove_old_owner.unwrap_or(true);
        if should_remove && old_owner != *new_owner {
            // Use existing remove_member method like governance does
            Self::remove_member(platform, group_id, &old_owner, new_owner)?;
        }

        Ok(())
    }

    pub fn transfer_ownership_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        new_owner: &AccountId,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let predecessor = env::predecessor_account_id();
        let config_path = Self::group_config_path(group_id);

        let config_data = match platform.storage_get(&config_path) {
            Some(data) => data,
            None => return Err(invalid_input!("Group not found")),
        };

        let current_owner: AccountId = GroupConfig::try_from_value(&config_data)
            .map_err(|_| invalid_input!("Invalid current owner in config"))?
            .owner;

        if current_owner == *new_owner {
            return Err(invalid_input!("Cannot transfer ownership to yourself"));
        }

        if !from_governance {
            let is_member_driven = GroupConfig::try_from_value(&config_data)?.member_driven;

            if is_member_driven {
                return Err(permission_denied!("transfer_ownership", &config_path));
            }

            if current_owner != predecessor {
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

        if let Some(obj) = config_data.as_object_mut() {
            obj.insert("owner".to_string(), Value::String(new_owner.to_string()));
            obj.insert(
                "ownership_transferred_at".to_string(),
                Value::String(transfer_timestamp.to_string()),
            );
            obj.insert(
                "previous_owner".to_string(),
                Value::String(current_owner.to_string()),
            );
        }

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
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
