use near_sdk::json_types::U128;
use near_sdk::serde_json::{self, Map, Value};
use near_sdk::{env, AccountId};

use super::types::{Event, EventData};
use super::{PREFIX, STANDARD, VERSION};

// --- Value conversion ---

pub(crate) trait IntoEventValue {
    fn into_event_value(self) -> Value;
}

impl IntoEventValue for &str {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for String {
    fn into_event_value(self) -> Value {
        Value::String(self)
    }
}

impl IntoEventValue for &String {
    fn into_event_value(self) -> Value {
        Value::String(self.clone())
    }
}

impl IntoEventValue for &AccountId {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for u32 {
    fn into_event_value(self) -> Value {
        Value::Number(self.into())
    }
}

impl IntoEventValue for u64 {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for u128 {
    fn into_event_value(self) -> Value {
        Value::String(self.to_string())
    }
}

impl IntoEventValue for U128 {
    fn into_event_value(self) -> Value {
        Value::String(self.0.to_string())
    }
}

impl IntoEventValue for bool {
    fn into_event_value(self) -> Value {
        Value::Bool(self)
    }
}

impl IntoEventValue for Value {
    fn into_event_value(self) -> Value {
        self
    }
}

impl IntoEventValue for Vec<String> {
    fn into_event_value(self) -> Value {
        Value::Array(self.into_iter().map(Value::String).collect())
    }
}

impl IntoEventValue for &[String] {
    fn into_event_value(self) -> Value {
        Value::Array(self.iter().map(|s| Value::String(s.clone())).collect())
    }
}

impl IntoEventValue for &[AccountId] {
    fn into_event_value(self) -> Value {
        Value::Array(self.iter().map(|a| Value::String(a.to_string())).collect())
    }
}

// --- EventBuilder ---

pub(crate) struct EventBuilder {
    event_type: &'static str,
    operation: &'static str,
    author: String,
    fields: Map<String, Value>,
}

impl EventBuilder {
    pub(crate) fn new(event_type: &'static str, operation: &'static str, author: &AccountId) -> Self {
        Self {
            event_type,
            operation,
            author: author.to_string(),
            fields: Map::new(),
        }
    }

    pub(crate) fn field(mut self, key: &str, value: impl IntoEventValue) -> Self {
        self.fields.insert(key.into(), value.into_event_value());
        self
    }

    pub(crate) fn field_opt(mut self, key: &str, value: Option<impl IntoEventValue>) -> Self {
        if let Some(v) = value {
            self.fields.insert(key.into(), v.into_event_value());
        }
        self
    }

    pub(crate) fn emit(self) {
        let event = Event {
            standard: STANDARD.into(),
            version: VERSION.into(),
            event: self.event_type.into(),
            data: vec![EventData {
                operation: self.operation.into(),
                author: self.author,
                extra: self.fields,
            }],
        };
        env::log_str(&format!("{PREFIX}{}", serde_json::to_string(&event).expect("event serialization failed")));
    }
}
