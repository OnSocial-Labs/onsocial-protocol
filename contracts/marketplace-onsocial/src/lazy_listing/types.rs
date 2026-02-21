//! Lazy listing domain types.

use near_sdk::json_types::U128;
use near_sdk::near;
use near_sdk::AccountId;

use crate::{ScarceOptions, TokenMetadata};

/// On-chain lazy listing; token is minted on purchase. Creator pays ~0.5 KB upfront.
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct LazyListingRecord {
    pub creator_id: AccountId,
    /// Stamped onto the token at mint time.
    pub metadata: TokenMetadata,
    /// yoctoNEAR. 0 = free.
    pub price: u128,
    /// NEP-199; baked into the minted token.
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    /// App pool to sponsor storage and receive fee split.
    #[serde(default)]
    pub app_id: Option<AccountId>,
    /// false = soulbound. Default true.
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    /// Whether the holder can burn. Default true.
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
    /// Nanoseconds; listing cannot be purchased after.
    #[serde(default)]
    pub expires_at: Option<u64>,
    /// Nanoseconds.
    pub created_at: u64,
}

/// Parameters for lazy listing creation.
#[near(serializers = [json])]
#[derive(Clone)]
pub struct LazyListing {
    pub metadata: TokenMetadata,
    pub price: U128,
    #[serde(flatten)]
    pub options: ScarceOptions,
    /// Nanoseconds. Listing cannot be purchased after.
    #[serde(default)]
    pub expires_at: Option<u64>,
}
