use near_sdk::serde_json;
use near_sdk::serde_json::Value;

use crate::{SocialError, invalid_input};

pub fn serialize_json_with_max_len(
    value: &Value,
    max_bytes: usize,
    serialize_err: &'static str,
    too_large_err: &'static str,
) -> Result<Vec<u8>, SocialError> {
    let bytes = serde_json::to_vec(value).map_err(|_| invalid_input!(serialize_err))?;
    if bytes.len() > max_bytes {
        return Err(invalid_input!(too_large_err));
    }
    Ok(bytes)
}
