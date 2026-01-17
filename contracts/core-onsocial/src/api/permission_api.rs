use near_sdk::{near, AccountId, PublicKey};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    /// Permission view methods. Mutations go through `execute()`.

    pub fn has_permission(
        &self,
        owner: AccountId,
        grantee: AccountId,
        path: String,
        level: u8,
    ) -> bool {
        crate::domain::groups::permissions::kv::has_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
            level,
        )
    }

    pub fn get_permissions(&self, owner: AccountId, grantee: AccountId, path: String) -> u8 {
        crate::domain::groups::permissions::kv::get_user_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
        )
    }

    pub fn get_key_permissions(&self, owner: AccountId, public_key: PublicKey, path: String) -> u8 {
        crate::domain::groups::permissions::kv::get_key_permissions(
            &self.platform,
            owner.as_str(),
            &public_key,
            &path,
        )
    }

    pub fn has_key_permission(
        &self,
        owner: AccountId,
        public_key: PublicKey,
        path: String,
        required_level: u8,
    ) -> bool {
        crate::domain::groups::permissions::kv::has_permissions_for_key(
            &self.platform,
            owner.as_str(),
            &public_key,
            &path,
            required_level,
        )
    }

    pub fn has_group_admin_permission(&self, group_id: String, user_id: AccountId) -> bool {
        crate::domain::groups::permissions::kv::has_group_admin_permission(&self.platform, &group_id, &user_id)
    }

    pub fn has_group_moderate_permission(&self, group_id: String, user_id: AccountId) -> bool {
        crate::domain::groups::permissions::kv::has_group_moderate_permission(&self.platform, &group_id, &user_id)
    }
}
