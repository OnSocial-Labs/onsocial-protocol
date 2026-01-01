use near_sdk::{AccountId, env, serde_json::{self, Value}};

use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::{invalid_input, permission_denied, SocialError};

impl crate::groups::core::GroupStorage {
    pub fn add_to_blacklist(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        adder_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::add_to_blacklist_internal(platform, group_id, target_id, adder_id, false)
    }

    pub fn add_to_blacklist_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        adder_id: &AccountId,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let op_path = format!("groups/{}/blacklist/{}", group_id, target_id);
        Self::assert_not_member_driven_unless_governance(
            platform,
            group_id,
            from_governance,
            "add_to_blacklist",
            &op_path,
        )?;

        if Self::is_owner(platform, group_id, target_id) {
            return Err(invalid_input!("Cannot blacklist group owner"));
        }

        if !from_governance {
            if Self::is_blacklisted(platform, group_id, adder_id) {
                return Err(permission_denied!(
                    "add_to_blacklist",
                    "You are blacklisted from this group"
                ));
            }

            let group_config_path = Self::group_config_path(group_id);
            if !Self::is_owner(platform, group_id, adder_id) {
                let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
                    .ok_or_else(|| invalid_input!("Group owner not found"))?;

                if !crate::groups::kv_permissions::can_manage(
                    platform,
                    &group_owner,
                    adder_id.as_str(),
                    &group_config_path,
                ) {
                    return Err(permission_denied!(
                        "add_to_blacklist",
                        &format!("groups/{}/blacklist/{}", group_id, target_id)
                    ));
                }
            }
        }

        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);

        platform.storage_set(&blacklist_path, &Value::Bool(true))?;

        if Self::is_member(platform, group_id, target_id) {
            Self::remove_member_internal(
                platform,
                group_id,
                target_id,
                adder_id,
                from_governance,
            )?;
        }

        let blacklist_event_data = Value::Object(serde_json::Map::from_iter([
            ("blacklisted".to_string(), Value::Bool(true)),
            (
                "added_by".to_string(),
                Value::String(adder_id.to_string()),
            ),
            (
                "added_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
            (
                "from_governance".to_string(),
                Value::Bool(from_governance),
            ),
        ]));
        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "add_to_blacklist",
            adder_id.clone(),
        )
        .with_target(target_id)
        .with_path(&format!("groups/{}/blacklist/{}", group_id, target_id))
        .with_value(blacklist_event_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub fn remove_from_blacklist(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        remover_id: &AccountId,
    ) -> Result<(), SocialError> {
        Self::remove_from_blacklist_internal(platform, group_id, target_id, remover_id, false)
    }

    pub fn remove_from_blacklist_internal(
        platform: &mut SocialPlatform,
        group_id: &str,
        target_id: &AccountId,
        remover_id: &AccountId,
        from_governance: bool,
    ) -> Result<(), SocialError> {
        let op_path = format!("groups/{}/blacklist/{}", group_id, target_id);
        Self::assert_not_member_driven_unless_governance(
            platform,
            group_id,
            from_governance,
            "remove_from_blacklist",
            &op_path,
        )?;

        if !from_governance {
            let group_config_path = Self::group_config_path(group_id);
            if !Self::is_owner(platform, group_id, remover_id) {
                let group_owner = crate::groups::kv_permissions::extract_path_owner(platform, &group_config_path)
                    .ok_or_else(|| invalid_input!("Group owner not found"))?;

                if !crate::groups::kv_permissions::can_manage(
                    platform,
                    &group_owner,
                    remover_id.as_str(),
                    &group_config_path,
                ) {
                    return Err(permission_denied!(
                        "remove_from_blacklist",
                        &format!("groups/{}/blacklist/{}", group_id, target_id)
                    ));
                }
            }
        }

        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);

        // Idempotent semantics: unblacklisting a non-blacklisted user is a no-op.
        // This is useful for batch operations and avoids clients needing a pre-check.
        if !Self::is_blacklisted(platform, group_id, target_id) {
            return Ok(());
        }

        if let Some(entry) = platform.get_entry(&blacklist_path) {
            if matches!(entry.value, crate::state::models::DataValue::Value(_)) {
                crate::storage::soft_delete_entry(platform, &blacklist_path, entry)?;
            }
        }

        let unblacklist_event_data = Value::Object(serde_json::Map::from_iter([
            ("blacklisted".to_string(), Value::Bool(false)),
            (
                "removed_by".to_string(),
                Value::String(remover_id.to_string()),
            ),
            (
                "removed_at".to_string(),
                Value::String(env::block_timestamp().to_string()),
            ),
            (
                "from_governance".to_string(),
                Value::Bool(from_governance),
            ),
        ]));
        let mut event_batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_GROUP_UPDATE,
            "remove_from_blacklist",
            remover_id.clone(),
        )
        .with_target(target_id)
        .with_path(&format!("groups/{}/blacklist/{}", group_id, target_id))
        .with_value(Value::Null)
        .with_structured_data(unblacklist_event_data)
        .emit(&mut event_batch);
        event_batch.emit()?;

        Ok(())
    }

    pub fn is_blacklisted(platform: &SocialPlatform, group_id: &str, target_id: &AccountId) -> bool {
        let blacklist_path = format!("groups/{}/blacklist/{}", group_id, target_id);
        if let Some(entry) = platform.get_entry(&blacklist_path) {
            matches!(entry.value, crate::state::models::DataValue::Value(_))
        } else {
            false
        }
    }
}
