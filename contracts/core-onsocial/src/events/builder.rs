// --- Unified Event Builder Module ---
//!
//! This module provides a unified event building system for consistent operation events across the entire platform.
//! It provides a fluent API for all domains.
//!
//! ## Key Features
//!
//! - **Unified Builder**: Single builder for all event types across the platform
//! - **Flexible Configuration**: Support for custom fields, targets, and metadata
//! - **Consistent Structure**: Standardized event format across all operations
//! - **Batch Emission**: Efficient event batching for multiple operations
//!
//! ## Usage
//!
//! ```rust
//! // Data operations
//! EventBuilder::new(EVENT_TYPE_DATA_UPDATE, "set", account_id)
//!     .with_path(data_path)
//!     .with_value(data_value)
//!     .emit(&mut event_batch);
//!
//! // Content operations
//! EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "create_post", account_id)
//!     .with_path(content_path)
//!     .with_value(post_data)
//!     .emit(&mut event_batch);
//!
//! // Group operations
//! EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "member_join", account_id)
//!     .with_target(&group_id)
//!     .with_field("role", "member")
//!     .emit(&mut event_batch);
//! ```

use crate::events::EventBatch;
use near_sdk::AccountId;
use near_sdk::serde_json::Value;

/// Unified event builder for all platform operations
#[derive(Debug)]
pub struct EventBuilder {
    event_type: String,
    operation: String,
    account_id: AccountId,
    additional_fields: serde_json::Map<String, Value>,
}

impl EventBuilder {
    /// Creates a new EventBuilder with the specified event type
    pub fn new(event_type: &str, operation: &str, account_id: AccountId) -> Self {
        Self {
            event_type: event_type.to_string(),
            operation: operation.to_string(),
            account_id,
            additional_fields: serde_json::Map::new(),
        }
    }

    /// Add a custom field to the event
    pub fn with_field<S: Into<String>, V: Into<Value>>(mut self, key: S, value: V) -> Self {
        self.additional_fields.insert(key.into(), value.into());
        self
    }

    /// Add a target account ID (commonly used for group operations)
    pub fn with_target(mut self, target_id: &AccountId) -> Self {
        self.additional_fields.insert("target_id".into(), target_id.as_str().into());
        self
    }

    /// Add a path field (commonly used for content and data operations)
    pub fn with_path(mut self, path: &str) -> Self {
        self.additional_fields.insert("path".into(), path.into());
        self
    }

    /// Add a value field (commonly used for storing the main data)
    pub fn with_value(mut self, value: Value) -> Self {
        self.additional_fields.insert("value".into(), value);
        self
    }

    /// Add tags field (commonly used for content categorization)
    pub fn with_tags(mut self, tags: Value) -> Self {
        self.additional_fields.insert("tags".into(), tags);
        self
    }

    /// Add structured data by flattening a JSON object into individual fields
    pub fn with_structured_data(mut self, data: Value) -> Self {
        if let Value::Object(map) = data {
            for (key, value) in map {
                self = self.with_field(&key, value);
            }
        }
        self
    }

    /// Build the final event data structure
    pub fn build(self) -> Value {
        let mut event_data = serde_json::Map::new();
        // Note: operation is now a top-level field, not in data

        // Add all additional fields
        for (key, value) in self.additional_fields {
            event_data.insert(key, value);
        }

        Value::Object(event_data)
    }

    /// Emit the event to the batch
    pub fn emit(self, event_batch: &mut EventBatch) {
        let account_id = self.account_id.clone();
        let event_type = self.event_type.clone();
        let operation = self.operation.clone();
        let event_data = self.build();
        event_batch.add(&event_type, &operation, &account_id, event_data);
    }
}
