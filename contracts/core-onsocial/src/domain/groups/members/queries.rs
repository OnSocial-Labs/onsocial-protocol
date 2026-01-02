use near_sdk::AccountId;

use crate::state::models::SocialPlatform;

impl crate::domain::groups::core::GroupStorage {
    pub fn can_grant_permissions(
        platform: &SocialPlatform,
        group_id: &str,
        granter_id: &AccountId,
        level: u8,
    ) -> bool {
        if Self::is_member_driven_group(platform, group_id) {
            return false;
        }

        if Self::is_owner(platform, group_id, granter_id) {
            return true;
        }

        if level == crate::domain::groups::kv_permissions::MANAGE {
            return false;
        }

        let group_config_path = Self::group_config_path(group_id);
        let group_owner =
            match crate::domain::groups::kv_permissions::extract_path_owner(platform, &group_config_path) {
                Some(owner) => owner,
                None => return false,
            };

        if crate::domain::groups::kv_permissions::can_manage(
            platform,
            &group_owner,
            granter_id.as_str(),
            &group_config_path,
        ) {
            return true;
        }

        if level == crate::domain::groups::kv_permissions::NONE || level == crate::domain::groups::kv_permissions::WRITE {
            if crate::domain::groups::kv_permissions::can_moderate(
                platform,
                &group_owner,
                granter_id.as_str(),
                &group_config_path,
            ) {
                return true;
            }
        }

        false
    }

    pub fn is_member(platform: &SocialPlatform, group_id: &str, member_id: &AccountId) -> bool {
        let member_path = Self::group_member_path(group_id, member_id.as_str());
        if let Some(entry) = platform.get_entry(&member_path) {
            matches!(entry.value, crate::state::models::DataValue::Value(_))
        } else {
            false
        }
    }
}
