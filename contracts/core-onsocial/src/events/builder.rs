use crate::events::EventBatch;
use near_sdk::AccountId;
use near_sdk::serde_json::{self, Value};
use std::collections::BTreeMap;

#[derive(Debug)]
pub struct EventBuilder {
    event_type: String,
    operation: String,
    account_id: AccountId,
    additional_fields: serde_json::Map<String, Value>,
    writes: Vec<(String, Value)>,
}

impl EventBuilder {
    pub fn new(event_type: &str, operation: &str, account_id: AccountId) -> Self {
        Self {
            event_type: event_type.to_string(),
            operation: operation.to_string(),
            account_id,
            additional_fields: serde_json::Map::new(),
            writes: Vec::new(),
        }
    }

    pub fn with_write<S: Into<String>, V: Into<Value>>(mut self, path: S, value: V) -> Self {
        self.writes.push((path.into(), value.into()));
        self
    }

    pub fn with_field<S: Into<String>, V: Into<Value>>(mut self, key: S, value: V) -> Self {
        self.additional_fields.insert(key.into(), value.into());
        self
    }

    pub fn with_target(mut self, target_id: &AccountId) -> Self {
        self.additional_fields.insert("target_id".into(), target_id.as_str().into());
        self
    }

    pub fn with_path(mut self, path: &str) -> Self {
        self.additional_fields.insert("path".into(), path.into());
        self
    }

    pub fn with_value(mut self, value: Value) -> Self {
        self.additional_fields.insert("value".into(), value);
        self
    }

    /// Flattens JSON object fields into the event. Existing fields take precedence.
    pub fn with_structured_data(mut self, data: Value) -> Self {
        let map = match data {
            Value::Object(map) => map,
            other => {
                self.additional_fields
                    .entry("structured_data")
                    .or_insert(other);
                return self;
            }
        };
        // Builder fields take precedence to prevent user-controlled data from spoofing core fields.
        for (key, value) in map {
            self.additional_fields.entry(key).or_insert(value);
        }
        self
    }

    fn merge_writes_field(
        additional_fields: &mut serde_json::Map<String, Value>,
        writes: Vec<(String, Value)>,
    ) {
        if writes.is_empty() && !additional_fields.contains_key("writes") {
            return;
        }

        let mut merged: BTreeMap<String, Value> = BTreeMap::new();

        if let Some(existing) = additional_fields.remove("writes") {
            if let Value::Array(items) = existing {
                for item in items {
                    let Some(obj) = item.as_object() else {
                        continue;
                    };
                    let Some(path) = obj.get("path").and_then(|v| v.as_str()) else {
                        continue;
                    };
                    let Some(value) = obj.get("value") else {
                        continue;
                    };
                    merged.insert(path.to_string(), value.clone());
                }
            }
        }

        for (path, value) in writes {
            merged.insert(path, value);
        }

        if merged.is_empty() {
            return;
        }

        let normalized = Value::Array(
            merged
                .into_iter()
                .map(|(path, value)| serde_json::json!({ "path": path, "value": value }))
                .collect(),
        );
        additional_fields.insert("writes".to_string(), normalized);
    }

    pub fn emit(self, event_batch: &mut EventBatch) {
        let Self {
            event_type,
            operation,
            account_id,
            mut additional_fields,
            writes,
        } = self;

        Self::merge_writes_field(&mut additional_fields, writes);

        event_batch.add(event_type, operation, account_id, Value::Object(additional_fields));
    }
}
