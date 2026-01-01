use near_sdk::serde_json::Value;
use near_sdk::AccountId;

use crate::errors::SocialError;

#[inline]
pub fn parse_account_id_str(value: &str, err: SocialError) -> Result<AccountId, SocialError> {
    value.parse::<AccountId>().map_err(|_| err)
}

#[inline]
pub fn parse_account_id_value(value: &Value, err: SocialError) -> Result<AccountId, SocialError> {
    match value.as_str() {
        Some(s) => s.parse::<AccountId>().map_err(|_| err),
        None => Err(err),
    }
}

#[inline]
pub fn parse_account_id_str_opt(value: &str) -> Option<AccountId> {
    value.parse::<AccountId>().ok()
}
