use near_sdk::serde_json::Value;

use crate::{invalid_input, SocialError};

pub fn validate_json_value_simple(
    value: &Value,
) -> Result<(), SocialError> {
    match value {
        Value::Object(obj) => {
            for key in obj.keys() {
                if key.is_empty() {
                    return Err(invalid_input!("Invalid JSON format"));
                }
            }
        }
        Value::Array(_) | Value::String(_) | Value::Number(_) | Value::Bool(_) | Value::Null => {}
    }
    Ok(())
}
