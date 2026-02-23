use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use crate::{ScarceOptions, TokenMetadata};

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LazyListingRecord {
    pub creator_id: AccountId,
    pub metadata: TokenMetadata,
    pub price: U128,
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    #[serde(default)]
    pub app_id: Option<AccountId>,
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    #[serde(default)]
    pub expires_at: Option<u64>,
    pub created_at: u64,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct LazyListing {
    pub metadata: TokenMetadata,
    pub price: U128,
    #[serde(flatten)]
    pub options: ScarceOptions,
    #[serde(default)]
    pub expires_at: Option<u64>,
}
