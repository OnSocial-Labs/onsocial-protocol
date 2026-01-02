mod types;
mod membership;
mod keys;
mod eval;
mod grants;
mod key_permissions;

#[cfg(test)]
pub(crate) mod keys_test_access {
    pub(crate) use super::keys::build_group_permission_key;
}

#[allow(unused_imports)]
pub use types::{FULL_ACCESS, MANAGE, MODERATE, NONE, WRITE, is_valid_permission_level};

#[allow(unused_imports)]
pub use eval::{
    can_manage,
    can_moderate,
    can_write,
    extract_path_owner,
    get_account_user_permissions,
    get_group_user_permissions,
    get_user_permissions,
    has_account_permissions,
    has_group_permissions,
    has_permissions,
    has_group_admin_permission,
    has_group_moderate_permission,
};

#[allow(unused_imports)]
pub use grants::{grant_permissions, revoke_permissions};

#[allow(unused_imports)]
pub use key_permissions::{
    get_key_permissions,
    grant_permissions_to_key,
    has_permissions_for_key,
    has_permissions_or_key_for_actor,
    revoke_permissions_for_key,
};

pub(crate) use types::GroupPathKind;
pub(crate) use eval::classify_group_path;
