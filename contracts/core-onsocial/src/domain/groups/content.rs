use near_sdk::{AccountId, serde_json::{self, Value}};
use crate::events::{EventBatch, EventBuilder};
use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::state::models::DataEntry;
use crate::state::models::DataValue;
use crate::validation::validate_json_value_simple;
use crate::SocialError;

pub struct GroupContentManager;

impl GroupContentManager {
    /// Creates, updates, or deletes group content under `{author}/groups/{group_id}/...`.
    pub fn create_group_content(
        platform: &mut SocialPlatform,
        group_path: &str,
        content: &Value,
        author: &AccountId,
        attached_balance: Option<&mut u128>,
        event_batch: &mut EventBatch,
    ) -> Result<String, SocialError> {
        let info = crate::domain::groups::permissions::kv::classify_group_path(group_path)
            .ok_or_else(|| crate::invalid_input!("Invalid group path format"))?;

        if info.kind == crate::domain::groups::permissions::kv::GroupPathKind::Config {
            return Err(crate::invalid_input!("Group config namespace is reserved"));
        }

        let normalized_path = info.normalized.as_str();
        let (group_id, content_path) = crate::validation::require_groups_path(normalized_path)?;

        // Validate group exists and config is well-formed.
        let config_path = format!("groups/{}/config", group_id);
        let config = platform.storage_get(&config_path)
            .ok_or_else(|| crate::invalid_input!("Group does not exist"))?;
        // Parse once to centralize defaults and validation.
        let _cfg = GroupConfig::try_from_value(&config)
            .map_err(|_| crate::invalid_input!("Group has no valid owner"))?;

        // Check permissions using the normalized path (without user prefix).
        // For group paths, the permission namespace is the group id.
        let can_write = crate::domain::groups::permissions::kv::can_write(platform, group_id, author.as_str(), normalized_path);
        if !can_write {
            return Err(crate::permission_denied!("write", normalized_path));
        }

        // User-owned storage path: {author}/groups/{group_id}/{content_path}
        // This ensures user owns the data and no cross-group collision
        let user_storage_path = format!("{}/groups/{}/{}", author, group_id, content_path);

        // Handle deletion (null content)
        if content.is_null() {
            if let Some(entry) = platform.get_entry(&user_storage_path) {
                crate::storage::soft_delete_entry(platform, &user_storage_path, entry)?;
                
                // Emit deletion event
                let mut extra = crate::events::derived_fields_from_path(&user_storage_path);
                crate::events::insert_block_context(&mut extra);
                let mut builder = EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "delete", author.clone())
                    .with_path(&user_storage_path)
                    .with_value(Value::Null);
                for (k, v) in extra {
                    builder = builder.with_field(k, v);
                }
                builder.emit(event_batch);
            }
            // If entry doesn't exist, deletion is idempotent (no-op)
            return Ok(user_storage_path);
        }

        // Validate content
        validate_json_value_simple(content)?;

        // Check if this is an update (entry already exists)
        let is_update = platform.get_entry(&user_storage_path).is_some();

        let serialized_content = serde_json::to_vec(content)
            .map_err(|e| crate::invalid_input!(format!("Failed to serialize content: {}", e)))?;

        if serialized_content.len() > platform.config.max_value_bytes as usize {
            return Err(crate::invalid_input!("Value payload too large"));
        }
            
        let data_entry = DataEntry {
            value: DataValue::Value(serialized_content),
            block_height: near_sdk::env::block_height(),
        };

        // Store content using the normal storage accounting pipeline so group sponsorship,
        // attached-deposit fallback, and spend events work consistently.
        let sponsor_outcome = platform
            .insert_entry_with_fallback(
                &user_storage_path,
                data_entry,
                attached_balance,
            )?
            .1;

        if let Some(crate::state::operations::SponsorOutcome::GroupSpend {
            group_id,
            payer,
            bytes,
            remaining_allowance,
        }) = sponsor_outcome
        {
            let mut builder = EventBuilder::new(
                crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                "group_sponsor_spend",
                payer.clone(),
            )
            .with_field("group_id", group_id)
            .with_field("payer", payer.to_string())
            .with_field("bytes", bytes.to_string());

            if let Some(remaining_allowance) = remaining_allowance {
                builder = builder.with_field("remaining_allowance", remaining_allowance.to_string());
            }

            builder.emit(event_batch);
        }

        // Emit event with correct operation (create vs update)
        let operation = if is_update { "update" } else { "create" };
        let mut extra = crate::events::derived_fields_from_path(&user_storage_path);
        crate::events::insert_block_context(&mut extra);
        let mut builder = EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, operation, author.clone())
            .with_path(&user_storage_path)
            .with_value(content.clone());
        for (k, v) in extra {
            builder = builder.with_field(k, v);
        }
        builder.emit(event_batch);

        Ok(user_storage_path)
    }
}