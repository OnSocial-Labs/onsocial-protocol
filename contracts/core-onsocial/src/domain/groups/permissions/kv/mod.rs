pub(crate) mod types;
mod membership;
pub(crate) mod keys;
mod eval;
mod grants;
mod key_permissions;

pub use eval::{
    can_manage,
    can_moderate,
    can_write,
    extract_path_owner,
    get_user_permissions,
    has_permissions,
    has_group_admin_permission,
    has_group_moderate_permission,
};

pub use grants::{grant_permissions, revoke_permissions};

pub use key_permissions::{
    get_key_permissions,
    grant_permissions_to_key,
    has_permissions_for_key,
    has_permissions_or_key_for_actor,
    revoke_permissions_for_key,
};

pub(crate) use types::GroupPathKind;
pub(crate) use eval::classify_group_path;
