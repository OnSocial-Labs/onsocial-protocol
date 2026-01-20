use crate::domain::groups::config::GroupConfig;
use crate::state::models::SocialPlatform;
use crate::{SocialError, invalid_input, permission_denied};

impl crate::domain::groups::core::GroupStorage {
    #[inline]
    pub(in crate::domain::groups::members) fn is_member_driven_group(
        platform: &SocialPlatform,
        group_id: &str,
    ) -> bool {
        let Some(config) = Self::get_group_config(platform, group_id) else {
            return false;
        };
        match GroupConfig::try_from_value(&config) {
            Ok(cfg) => cfg.member_driven,
            Err(_) => false,
        }
    }

    #[inline]
    pub(in crate::domain::groups::members) fn is_private_group(
        platform: &SocialPlatform,
        group_id: &str,
    ) -> bool {
        let Some(config) = Self::get_group_config(platform, group_id) else {
            return false;
        };
        match GroupConfig::try_from_value(&config) {
            Ok(cfg) => cfg.is_private.unwrap_or(false),
            Err(_) => false,
        }
    }

    #[inline]
    pub(in crate::domain::groups::members) fn assert_not_member_driven_unless_governance(
        platform: &SocialPlatform,
        group_id: &str,
        from_governance: bool,
        action: &str,
        path: &str,
    ) -> Result<(), SocialError> {
        if !from_governance && Self::is_member_driven_group(platform, group_id) {
            return Err(permission_denied!(action, path));
        }
        Ok(())
    }

    #[inline]
    pub(in crate::domain::groups::members) fn assert_join_requests_not_member_driven(
        platform: &SocialPlatform,
        group_id: &str,
    ) -> Result<(), SocialError> {
        if Self::is_member_driven_group(platform, group_id) {
            return Err(invalid_input!(
                "Member-driven groups handle join requests through proposals only"
            ));
        }
        Ok(())
    }

    pub(in crate::domain::groups::members) fn group_join_requests_path(group_id: &str) -> String {
        format!("groups/{}/join_requests", group_id)
    }

    pub(in crate::domain::groups::members) fn group_member_nonce_path(
        group_id: &str,
        member_id: &str,
    ) -> String {
        format!("groups/{}/member_nonces/{}", group_id, member_id)
    }
}
