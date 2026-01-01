use crate::state::models::{DataValue, SocialPlatform};

#[inline]
pub(crate) fn get_group_member_nonce(
    platform: &SocialPlatform,
    group_id: &str,
    member_id: &str,
) -> Option<u64> {
    // Stored separately for stable reads.
    let nonce_path = format!("groups/{}/member_nonces/{}", group_id, member_id);
    platform.storage_get(&nonce_path).and_then(|v| v.as_u64())
}

#[inline]
pub(crate) fn is_group_member(platform: &SocialPlatform, group_id: &str, member_id: &str) -> bool {
    let member_path = format!("groups/{}/members/{}", group_id, member_id);
    platform
        .get_entry(&member_path)
        .is_some_and(|e| matches!(e.value, DataValue::Value(_)))
}

#[inline]
pub(crate) fn get_active_group_member_nonce(
    platform: &SocialPlatform,
    group_id: &str,
    member_id: &str,
) -> Option<u64> {
    if !is_group_member(platform, group_id, member_id) {
        return None;
    }
    match get_group_member_nonce(platform, group_id, member_id) {
        Some(nonce) if nonce > 0 => Some(nonce),
        _ => None,
    }
}
