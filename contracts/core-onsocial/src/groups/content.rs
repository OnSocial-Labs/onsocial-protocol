// --- Group Content Module ---
// Clean, centralized group content operations for new development

use near_sdk::{AccountId, serde_json::{Value, json}};
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::state::models::DataEntry;
use crate::state::models::DataValue;
use crate::validation::validate_json_value_simple;
use crate::{SocialError};

/// Clean interface for group content operations
pub struct GroupContentManager;

impl GroupContentManager {
    /// Handle group content creation with full validation and transformation
    /// Returns the user-owned storage path where content was stored
    pub fn create_group_content(
        platform: &mut SocialPlatform,
        group_path: &str,        // Original path like "groups/mygroup/posts" or "user/groups/mygroup/posts"
        content: &Value,         // The content to store
        author: &AccountId,      // Who is creating the content
        event_batch: &mut EventBatch,
    ) -> Result<String, SocialError> {
        // Handle both user-prefixed paths (user/groups/...) and direct paths (groups/...)
        let normalized_path = if group_path.starts_with("groups/") {
            group_path.to_string()
        } else if let Some(groups_idx) = group_path.find("/groups/") {
            // Strip user prefix: "bob.near/groups/foo/..." -> "groups/foo/..."
            group_path[groups_idx + 1..].to_string()
        } else {
            return Err(crate::invalid_input!("Invalid group path format"));
        };
        
        // Parse group path directly
        let groups_prefix = "groups/";
        let remaining = &normalized_path[groups_prefix.len()..];
        let slash_pos = remaining.find('/').ok_or_else(|| crate::invalid_input!("Invalid group path format"))?;
        let group_id = &remaining[..slash_pos];
        let content_path = &remaining[slash_pos + 1..];
        if content_path.is_empty() {
            return Err(crate::invalid_input!("Invalid group path format"));
        }

        // Validate group and get owner - use simple path
        let config_path = format!("groups/{}/config", group_id);
        let config = platform.storage_get(&config_path)
            .ok_or_else(|| crate::invalid_input!("Group does not exist"))?;
        let group_owner = config.get("owner").and_then(|o| o.as_str())
            .ok_or_else(|| crate::invalid_input!("Group config invalid"))?;

        // Check permissions directly using the normalized path (without user prefix)
        let can_write = crate::groups::kv_permissions::can_write(platform, group_owner, author.as_str(), &normalized_path);
        if !can_write {
            return Err(crate::permission_denied!("write", &normalized_path));
        }

        // Validate content
        validate_json_value_simple(content, platform)?;

        // Create user storage path
        let user_storage_path = format!("{}/{}", author, content_path);

        // Create enriched content once with minimal operations
        let timestamp = near_sdk::env::block_timestamp();
        let enriched_content = json!({
            "content": content,
            "group_id": group_id,
            "group_path": content_path,
            "full_group_path": &normalized_path,
            "created_by": author.as_str(),
            "created_at": timestamp,
            "content_id": format!("c_{}", timestamp)
        });

        // Store directly
        let serialized_content = serde_json::to_vec(&enriched_content)
            .map_err(|e| crate::invalid_input!(format!("Failed to serialize content: {}", e)))?;
        
        // Create metadata once and reuse for both storage and events
        let metadata = crate::data::metadata::MetadataBuilder::from_path(&normalized_path, author, Some(&enriched_content))
            .with_field("created_by", author.as_str())
            .build();
        let serialized_metadata = serde_json::to_vec(&metadata)
            .map_err(|_| crate::invalid_input!("Metadata serialization failed"))?;
            
        let data_entry = DataEntry {
            value: DataValue::Value(serialized_content),
            metadata: serialized_metadata,
            block_height: near_sdk::env::block_height(),
            tags: vec![],
        };
        platform.insert_entry(&user_storage_path, data_entry)?;

        // Emit event directly - reuse the metadata object
        EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "create", author.clone())
            .with_path(&user_storage_path)
            .with_value(enriched_content)
            .with_tags(json!([]))
            .with_structured_data(metadata)
            .emit(event_batch);

        Ok(user_storage_path)
    }
}