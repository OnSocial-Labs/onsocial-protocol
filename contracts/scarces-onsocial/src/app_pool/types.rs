use near_sdk::AccountId;
use near_sdk::json_types::U128;
use near_sdk::near;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AppPool {
    pub owner_id: AccountId,
    pub balance: U128,
    pub used_bytes: u64,
    pub max_user_bytes: u64,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: u16,
    #[serde(default)]
    pub moderators: Vec<AccountId>,
    #[serde(default)]
    pub curated: bool,
    #[serde(default)]
    pub metadata: Option<String>,
}

#[near(serializers = [json])]
#[derive(Clone, Default)]
pub struct AppConfig {
    pub max_user_bytes: Option<u64>,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: Option<u16>,
    pub curated: Option<bool>,
    pub metadata: Option<String>,
}
