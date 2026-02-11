//! Canonical JSON serialization for deterministic signature verification.

use serde_json::{Map, Value};

/// Recursively sort object keys for deterministic serialization.
pub fn canonicalize_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();

            let mut out = Map::new();
            for key in keys {
                if let Some(v) = map.get(key) {
                    out.insert(key.clone(), canonicalize_json_value(v));
                }
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_json_value).collect()),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => value.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_sorts_keys() {
        let input = json!({"z": 1, "a": 2, "m": 3});
        let canonical = canonicalize_json_value(&input);
        let keys: Vec<&String> = canonical.as_object().unwrap().keys().collect();
        assert_eq!(keys, vec!["a", "m", "z"]);
    }

    #[test]
    fn test_recursive_sort() {
        let input = json!({"b": {"z": 1, "a": 2}, "a": [{"c": 3, "b": 4}]});
        let canonical = canonicalize_json_value(&input);
        let s = serde_json::to_string(&canonical).unwrap();
        assert_eq!(s, r#"{"a":[{"b":4,"c":3}],"b":{"a":2,"z":1}}"#);
    }

    #[test]
    fn test_preserves_primitives() {
        assert_eq!(canonicalize_json_value(&json!(null)), json!(null));
        assert_eq!(canonicalize_json_value(&json!(true)), json!(true));
        assert_eq!(canonicalize_json_value(&json!(42)), json!(42));
        assert_eq!(canonicalize_json_value(&json!("hello")), json!("hello"));
    }
}
