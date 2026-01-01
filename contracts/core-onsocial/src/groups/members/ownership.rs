use near_sdk::AccountId;

use crate::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;

impl crate::groups::core::GroupStorage {
	pub fn is_owner(platform: &SocialPlatform, group_id: &str, user_id: &AccountId) -> bool {
		let config_path = Self::group_config_path(group_id);

		if let Some(config_data) = platform.storage_get(&config_path) {
			return match GroupConfig::try_from_value(&config_data) {
				Ok(cfg) => cfg.owner == *user_id,
				Err(_) => false,
			};
		}

		false
	}
}
