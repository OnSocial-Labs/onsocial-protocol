use crate::{state::models::SocialPlatform, SocialError};
use near_sdk::{near, json_types::U64, AccountId, PublicKey};

use crate::api::guards::{ContractGuards, DepositPolicy, PayableCaller};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    fn execute_payable_permission_operation<F, R>(&mut self, operation: F) -> Result<R, SocialError>
    where
        F: FnOnce(&mut SocialPlatform, &AccountId, &mut u128) -> Result<R, SocialError>,
    {
        ContractGuards::execute_payable_operation(
            &mut self.platform,
            PayableCaller::Signer,
            DepositPolicy::SaveUnused {
                reason: "unused_deposit_saved",
            },
            |platform, caller, attached_balance| {
                let attached_balance = attached_balance.ok_or_else(|| {
                    crate::invalid_input!("Internal error: missing attached balance")
                })?;
                operation(platform, caller, attached_balance)
            },
        )
    }

    pub fn has_permission(
        &self,
        owner: AccountId,
        grantee: AccountId,
        path: String,
        level: u8,
    ) -> bool {
        crate::groups::kv_permissions::has_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
            level,
        )
    }

    pub fn get_permissions(&self, owner: AccountId, grantee: AccountId, path: String) -> u8 {
        crate::groups::kv_permissions::get_user_permissions(
            &self.platform,
            owner.as_str(),
            grantee.as_str(),
            &path,
        )
    }

    pub fn get_key_permissions(&self, owner: AccountId, public_key: PublicKey, path: String) -> u8 {
        crate::groups::kv_permissions::get_key_permissions(
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
        crate::groups::kv_permissions::has_permissions_for_key(
            &self.platform,
            owner.as_str(),
            &public_key,
            &path,
            required_level,
        )
    }

    #[payable]
    #[handle_result]
    pub fn set_permission(
        &mut self,
        grantee: AccountId,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    ) -> Result<(), SocialError> {
        self.execute_payable_permission_operation(|platform, caller, attached_balance| {
            platform.set_permission(
                grantee,
                path,
                level,
                expires_at.map(|v| v.0),
                caller,
                None,
                Some(attached_balance),
            )
        })
    }

    #[payable]
    #[handle_result]
    pub fn set_key_permission(
        &mut self,
        public_key: PublicKey,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    ) -> Result<(), SocialError> {
        self.execute_payable_permission_operation(|platform, caller, attached_balance| {
            platform.set_key_permission(
                public_key,
                path,
                level,
                expires_at.map(|v| v.0),
                caller,
                None,
                Some(attached_balance),
            )
        })
    }

    pub fn has_group_admin_permission(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::kv_permissions::has_group_admin_permission(&self.platform, &group_id, &user_id)
    }

    pub fn has_group_moderate_permission(&self, group_id: String, user_id: AccountId) -> bool {
        crate::groups::kv_permissions::has_group_moderate_permission(&self.platform, &group_id, &user_id)
    }
}
