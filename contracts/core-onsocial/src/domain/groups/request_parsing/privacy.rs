use near_sdk::AccountId;

use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    /// Set group privacy (private/public).
    pub fn set_group_privacy(
        &mut self,
        group_id: String,
        is_private: bool,
        caller: &AccountId,
    ) -> Result<(), SocialError> {
        crate::domain::groups::core::GroupStorage::set_group_privacy(self, &group_id, caller, is_private)
    }
}
