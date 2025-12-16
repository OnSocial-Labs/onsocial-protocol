// --- Imports ---
use near_sdk::{
    env,
    serde_json::Value,
    AccountId,
};

// --- Examples ---
/// Example usage of the path-aware MetadataBuilder:
///
/// ```rust,ignore
/// // Primary method for path/wildcard-driven operations:
/// let metadata = MetadataBuilder::from_path(
///     "alice.near/contents/post/post123",
///     &author,
///     Some(&value)
/// ).build();
///
/// // The method automatically derives:
/// // - id: "post123"
/// // - type: "content"
/// // - group_id, group_path, is_group_content (auto-detected for group paths)
/// // - author, timestamp, block_height (always included)
/// // - parent_id, thread_root_id, group_id (client-provided in metadata)
/// // - access control based on permissions
/// ```
/// Builder for constructing metadata objects with custom fields and access control.
/// Optimized for path/wildcard-driven unified set operations.
#[derive(Clone)]
pub struct MetadataBuilder {
    data: serde_json::Map<String, Value>,
}

// --- Public API ---
impl MetadataBuilder {
    /// Creates a new MetadataBuilder with base fields derived from path.
    /// Automatically extracts metadata fields from path structure for unified operations.
    pub fn from_path(full_path: &str, author: &AccountId, value: Option<&Value>) -> Self {
        let mut data = serde_json::Map::new();
        let timestamp = env::block_timestamp();
        let height = env::block_height();

        // Base fields - direct Value creation for efficiency
        data.insert("author".into(), Value::String(author.as_str().to_string()));
        data.insert("timestamp".into(), Value::Number(timestamp.into()));
        data.insert("block_height".into(), Value::Number(height.into()));

        // Parse path once and derive all fields
        let parts: Vec<&str> = full_path.split('/').collect();
        Self::derive_universal_fields(&mut data, &parts, full_path, value);

        Self { data }
    }

    /// Builds the final metadata Value.
    pub fn build(self) -> Value {
        Value::Object(self.data)
    }

    // --- Private Helpers ---

    /// Extract only universally useful metadata fields
    /// This replaces all the hardcoded social-specific derivation methods
    fn derive_universal_fields(
        data: &mut serde_json::Map<String, Value>,
        parts: &[&str],
        _full_path: &str,
        value: Option<&Value>,
    ) {
        // Extract ID from last path segment (works for ANY path structure)
        if let Some(id) = parts.last() {
            data.insert("id".into(), Value::String(id.to_string()));
        }

        // Extract basic type from first path segment (generic, not hardcoded)
        if let Some(type_segment) = parts.get(1) {
            data.insert("type".into(), Value::String(type_segment.to_string()));
        } else {
            data.insert("type".into(), Value::String("data".to_string()));
        }

        // Auto-detect group paths and extract group metadata (reuse parsed parts)
        Self::extract_group_metadata(data, parts);

        // If client included metadata in the value, preserve it for events
        // This allows clients to include parent_id, thread_root_id, group_id, etc. in events
        if let Some(val) = value {
            if let Some(client_metadata) = val.get("metadata").and_then(|m| m.as_object()) {
                // Merge client-provided metadata into our metadata
                for (key, value) in client_metadata {
                    data.insert(key.clone(), value.clone());
                }
            }
        }
    }

    /// Automatically extract group metadata from group paths (optimized to reuse parsed parts)
    /// Handles both formats:
    /// - Direct: groups/{group_id}/posts/1
    /// - User-prefixed: {author}/groups/{group_id}/posts/1
    fn extract_group_metadata(data: &mut serde_json::Map<String, Value>, parts: &[&str]) {
        // Check for direct group path: groups/{group_id}/...
        if parts.len() >= 3 && parts[0] == "groups" {
            data.insert("group_id".into(), Value::String(parts[1].to_string()));
            if parts.len() > 2 {
                let group_path = parts[2..].join("/");
                data.insert("group_path".into(), Value::String(group_path));
            }
            data.insert("is_group_content".into(), Value::Bool(true));
        }
        // Check for user-prefixed group path: {author}/groups/{group_id}/...
        else if parts.len() >= 4 && parts[1] == "groups" {
            data.insert("group_id".into(), Value::String(parts[2].to_string()));
            if parts.len() > 3 {
                let group_path = parts[3..].join("/");
                data.insert("group_path".into(), Value::String(group_path));
            }
            data.insert("is_group_content".into(), Value::Bool(true));
        }
    }
}
