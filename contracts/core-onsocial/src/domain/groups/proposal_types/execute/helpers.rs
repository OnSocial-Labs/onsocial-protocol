use near_sdk::AccountId;

use crate::state::models::SocialPlatform;

/// Context for executing proposals.
pub(super) struct ExecutionContext<'a> {
    pub platform: &'a mut SocialPlatform,
    pub group_id: &'a str,
    pub executor: &'a AccountId,
}

/// Data for path permission grant operations.
pub(super) struct PathPermissionGrantData<'a> {
    pub target_user: &'a AccountId,
    pub path: &'a str,
    pub level: u8,
    pub reason: &'a str,
}
