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
/// // - content_id: "post123"
/// // - content_type: "post"
/// // - group_id, group_path, is_group_content (auto-detected for group paths)
/// // - parent_id, thread_root_id, group_id (client-provided in metadata)
/// // - access control based on permissions
///
/// // Add custom fields if needed:
/// let metadata = MetadataBuilder::from_path(path, &author, Some(&value))
///     .with_field("custom_field", "value")
///     .build();
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

    /// Adds a custom field to metadata.
    pub fn with_field(mut self, key: &str, value: impl serde::Serialize) -> Self {
        // Direct Value creation for common types to avoid serde overhead
        let v = match serde_json::to_value(&value) {
            Ok(val) if !val.is_null() => val,
            _ => return self, // Skip on error or null
        };
        self.data.insert(key.to_string(), v);
        self
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
    fn extract_group_metadata(data: &mut serde_json::Map<String, Value>, parts: &[&str]) {
        if parts.len() >= 3 && parts[0] == "groups" {
            // Extract group_id from second segment
            data.insert("group_id".into(), Value::String(parts[1].to_string()));

            // Extract group_path from remaining segments (efficient join)
            if parts.len() > 2 {
                let group_path = parts[2..].join("/");
                data.insert("group_path".into(), Value::String(group_path));
            }

            // Mark as group content
            data.insert("is_group_content".into(), Value::Bool(true));
        }
    }
}
