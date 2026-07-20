use near_sdk::AccountId;
use near_sdk::json_types::U128;
use near_sdk::near;

use crate::{ScarceOptions, TokenMetadata};

/// On-chain lazy listing. Edition size is NEP-177 `metadata.copies`;
/// progress is first-class `minted_count` (collections-aligned).
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
    /// Editions already minted from this listing. Remaining = copies − minted_count.
    #[serde(default)]
    #[borsh(deserialize_with = "crate::deserialize_minted_count")]
    pub minted_count: u32,
    /// Max editions a buyer may purchase in one call. Default 1 (social).
    #[serde(default = "crate::default_one")]
    #[borsh(deserialize_with = "crate::deserialize_max_per_purchase_listing")]
    pub max_per_purchase: u32,
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
    /// Max editions per purchase call (1..=MAX_BATCH_MINT). Default 1.
    #[serde(default = "crate::default_one")]
    pub max_per_purchase: u32,
}
