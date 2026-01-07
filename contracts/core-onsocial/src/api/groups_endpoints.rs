use near_sdk::{near, serde_json::Value, AccountId};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    // ─────────────────────────────────────────────────────────────────────────
    // Group Query API (View Methods)
    // 
    // All mutating group operations are now handled via the unified execute()
    // endpoint with full auth support (Direct, SignedPayload, DelegateAction, Intent).
    // ─────────────────────────────────────────────────────────────────────────

    pub fn get_group_config(&self, group_id: String) -> Option<Value> {
        crate::domain::groups::core::GroupStorage::get_group_config(&self.platform, &group_id)
    }

    pub fn get_member_data(&self, group_id: String, member_id: AccountId) -> Option<Value> {
        crate::domain::groups::core::GroupStorage::get_member_data(&self.platform, &group_id, &member_id)
    }

    pub fn is_group_member(&self, group_id: String, member_id: AccountId) -> bool {
        crate::domain::groups::core::GroupStorage::is_member(&self.platform, &group_id, &member_id)
    }

    pub fn is_group_owner(&self, group_id: String, user_id: AccountId) -> bool {
        crate::domain::groups::core::GroupStorage::is_owner(&self.platform, &group_id, &user_id)
    }

    pub fn is_blacklisted(&self, group_id: String, user_id: AccountId) -> bool {
        crate::domain::groups::core::GroupStorage::is_blacklisted(&self.platform, &group_id, &user_id)
    }

    pub fn get_join_request(&self, group_id: String, requester_id: AccountId) -> Option<Value> {
        crate::domain::groups::core::GroupStorage::get_join_request(&self.platform, &group_id, &requester_id)
    }

    pub fn get_group_stats(&self, group_id: String) -> Option<Value> {
        crate::domain::groups::core::GroupStorage::get_group_stats(&self.platform, &group_id)
    }
}
