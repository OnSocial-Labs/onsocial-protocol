use near_sdk::{AccountId, serde_json::Value};

use crate::SocialError;
use crate::state::models::SocialPlatform;

impl SocialPlatform {
    pub fn update_group_metadata(
        &mut self,
        group_id: String,
        changes: Value,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::validation::validate_group_id(&group_id)?;
        crate::domain::groups::core::GroupStorage::update_group_metadata(
            self, &group_id, caller, changes,
        )
    }
}
