// --- Group Content Module ---
// Clean, centralized group content operations for new development
//
// USER-OWNED STORAGE DESIGN:
// - User sends: groups/{group_id}/posts/1
// - Contract stores at: {author}/groups/{group_id}/posts/1
// - Contract returns: {author}/groups/{group_id}/posts/1 (use this for reads)
// - User reads using the returned path directly (O(1) lookup)
//
// METADATA (via MetadataBuilder):
// - author, timestamp, block_height (standard fields)
// - group_id, id, type (auto-derived from path)
// - No enrichment wrapper - raw content stored, metadata separate
//
// Benefits:
// - User owns their content (under their namespace)
// - No cross-group collision (path includes author + group_id)
// - Consistent with individual content storage
// - Single write, single read
// - Only author can modify/delete their content

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
    /// Handle group content creation/update/deletion with full validation
    /// 
    /// Write path transformation:
    /// - Input: groups/{group_id}/posts/1
    /// - Output: {author}/groups/{group_id}/posts/1
    ///
    /// Returns the user-owned storage path where content was stored
    pub fn create_group_content(
        platform: &mut SocialPlatform,
        group_path: &str,        // Original path like "groups/mygroup/posts/1"
        content: &Value,         // The content to store (null for deletion)
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

        // User-owned storage path: {author}/groups/{group_id}/{content_path}
        // This ensures user owns the data and no cross-group collision
        let user_storage_path = format!("{}/groups/{}/{}", author, group_id, content_path);

        // Handle deletion (null content)
        if content.is_null() {
            if let Some(entry) = platform.get_entry(&user_storage_path) {
                crate::storage::soft_delete_entry(platform, &user_storage_path, entry)?;
                
                // Emit deletion event
                EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, "delete", author.clone())
                    .with_path(&user_storage_path)
                    .with_field("group_id", group_id)
                    .with_field("content_path", content_path)
                    .emit(event_batch);
            }
            // If entry doesn't exist, deletion is idempotent (no-op)
            return Ok(user_storage_path);
        }

        // Validate content
        validate_json_value_simple(content, platform)?;

        // Check if this is an update (entry already exists)
        let is_update = platform.get_entry(&user_storage_path).is_some();

        // Store raw content (no enrichment wrapper)
        // Metadata is handled by MetadataBuilder and stored separately in DataEntry.metadata
        let serialized_content = serde_json::to_vec(content)
            .map_err(|e| crate::invalid_input!(format!("Failed to serialize content: {}", e)))?;
        
        // MetadataBuilder auto-derives: author, timestamp, block_height, group_id, id, type
        let metadata = crate::data::metadata::MetadataBuilder::from_path(&user_storage_path, author, Some(content))
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

        // Emit event with correct operation (create vs update)
        let operation = if is_update { "update" } else { "create" };
        EventBuilder::new(crate::constants::EVENT_TYPE_GROUP_UPDATE, operation, author.clone())
            .with_path(&user_storage_path)
            .with_value(content.clone())
            .with_tags(json!([]))
            .with_structured_data(metadata)
            .emit(event_batch);

        Ok(user_storage_path)
    }
}