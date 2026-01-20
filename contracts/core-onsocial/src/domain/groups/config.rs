use near_sdk::AccountId;
use near_sdk::serde_json::Value;

use crate::{SocialError, invalid_input};

#[derive(Clone, Debug)]
pub(crate) struct GroupConfig {
    pub owner: AccountId,
    pub member_driven: bool,
    pub is_private: Option<bool>,
}

impl GroupConfig {
    pub(crate) fn try_from_value(value: &Value) -> Result<Self, SocialError> {
        let owner_value = value
            .get("owner")
            .ok_or_else(|| invalid_input!("Group owner not found"))?;
        let owner: AccountId = crate::validation::parse_account_id_value(
            owner_value,
            invalid_input!("Invalid group owner account ID"),
        )?;

        let member_driven = value
            .get("member_driven")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);

        let is_private = value.get("is_private").and_then(|v| v.as_bool());

        Ok(Self {
            owner,
            member_driven,
            is_private,
        })
    }
}
