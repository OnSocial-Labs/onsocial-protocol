//! App pool domain types.

use near_sdk::near;
use near_sdk::AccountId;

/// Per-app isolated storage pool.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AppPool {
    pub owner_id: AccountId,
    /// yoctoNEAR.
    pub balance: u128,
    pub used_bytes: u64,
    /// Per-user lifetime cap (bytes).
    pub max_user_bytes: u64,
    /// Default royalty for all app collections; merged with creator royalties, capped at MAX_ROYALTY_BPS.
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// Primary sale commission in bps; paid to app owner directly. Max 5000.
    pub primary_sale_bps: u16,
    /// Authorised to ban/create collections (curated mode). Max 20; only owner can modify.
    #[serde(default)]
    pub moderators: Vec<AccountId>,
    /// true = only owner/moderator can create collections; false = anyone can.
    #[serde(default)]
    pub curated: bool,
    /// Free-form JSON metadata.
    #[serde(default)]
    pub metadata: Option<String>,
}

/// Parameters for `RegisterApp` / `SetAppConfig`.
#[near(serializers = [json])]
#[derive(Clone, Default)]
pub struct AppConfig {
    pub max_user_bytes: Option<u64>,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: Option<u16>,
    pub curated: Option<bool>,
    pub metadata: Option<String>,
}
