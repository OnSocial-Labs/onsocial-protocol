use near_sdk::{
    AccountId, env,
    serde_json::{Map, Value},
};

use crate::domain::groups::config::GroupConfig;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input, permission_denied};

const RESERVED_METADATA_KEYS: &[&str] = &["owner", "update_type", "changes", "member_driven"];

/// Deep-merge object patches into existing JSON.
/// Nested objects merge; other values replace. `null` clears a key to null.
pub(crate) fn deep_merge_json(target: &mut Value, patch: &Value) {
    match (target, patch) {
        (Value::Object(target_obj), Value::Object(patch_obj)) => {
            for (key, patch_value) in patch_obj {
                if patch_value.is_null() {
                    target_obj.insert(key.clone(), Value::Null);
                    continue;
                }
                match target_obj.get_mut(key) {
                    Some(existing) if existing.is_object() && patch_value.is_object() => {
                        deep_merge_json(existing, patch_value);
                    }
                    _ => {
                        target_obj.insert(key.clone(), patch_value.clone());
                    }
                }
            }
        }
        (target_slot, patch_value) => {
            *target_slot = patch_value.clone();
        }
    }
}

/// Apply top-level metadata changes with deep-merge for nested objects
/// (so `x.onsocial.banner` and `x.onsocial.structure` coexist).
pub(crate) fn apply_group_config_changes(
    config_obj: &mut Map<String, Value>,
    changes_obj: &Map<String, Value>,
    reserved_keys: &[&str],
) -> Result<(), SocialError> {
    for (key, value) in changes_obj {
        if reserved_keys.contains(&key.as_str()) {
            return Err(invalid_input!(format!(
                "Cannot update reserved metadata field `{key}`"
            )));
        }
        match config_obj.get_mut(key) {
            Some(existing) if existing.is_object() && value.is_object() => {
                deep_merge_json(existing, value);
            }
            _ => {
                config_obj.insert(key.clone(), value.clone());
            }
        }
    }
    Ok(())
}

impl crate::domain::groups::core::GroupStorage {
    pub fn update_group_metadata(
        platform: &mut SocialPlatform,
        group_id: &str,
        caller_id: &AccountId,
        changes: Value,
    ) -> Result<(), SocialError> {
        let config_path = Self::group_config_path(group_id);

        if !Self::is_owner(platform, group_id, caller_id) {
            return Err(permission_denied!("update_group_metadata", &config_path));
        }

        let config_data = platform
            .storage_get(&config_path)
            .ok_or_else(|| invalid_input!("Group not found"))?;

        let cfg = GroupConfig::try_from_value(&config_data)?;
        if cfg.member_driven {
            return Err(invalid_input!(
                "Member-driven groups must update metadata through proposals"
            ));
        }

        let changes_obj = changes
            .as_object()
            .ok_or_else(|| invalid_input!("Metadata changes must be a JSON object"))?;
        if changes_obj.is_empty() {
            return Err(invalid_input!("Metadata changes cannot be empty"));
        }

        let mut config_data = config_data;
        {
            let config_obj = config_data
                .as_object_mut()
                .ok_or_else(|| invalid_input!("Group config must be a JSON object"))?;

            apply_group_config_changes(config_obj, changes_obj, RESERVED_METADATA_KEYS)?;
        }

        let updated_cfg = GroupConfig::try_from_value(&config_data)?;
        Self::assert_member_driven_private_invariant(
            updated_cfg.member_driven,
            updated_cfg.is_private,
        )?;

        let config_obj = config_data
            .as_object_mut()
            .ok_or_else(|| invalid_input!("Group config must be a JSON object"))?;
        config_obj.insert(
            "metadata_updated_at".to_string(),
            Value::String(env::block_timestamp().to_string()),
        );
        config_obj.insert(
            "metadata_updated_by".to_string(),
            Value::String(caller_id.to_string()),
        );

        platform.storage_set(&config_path, &config_data)?;

        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "metadata_updated",
            caller_id.clone(),
        )
        .with_path(&config_path)
        .with_value(config_data.clone())
        .with_structured_data(config_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }
}
