use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::near;
use near_sdk::AccountId;

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct TokenMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<Base64VecU8>,
    pub copies: Option<u64>,
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct ScarceOptions {
    #[serde(default)]
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    #[serde(default)]
    pub app_id: Option<AccountId>,
    #[serde(default = "crate::default_true")]
    pub transferable: bool,
    #[serde(default = "crate::default_true")]
    pub burnable: bool,
}

#[derive(Clone)]
pub struct MintContext {
    pub owner_id: AccountId,
    pub creator_id: AccountId,
    pub minter_id: AccountId,
}

#[derive(Clone, Default)]
pub struct ScarceOverrides {
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub app_id: Option<AccountId>,
    pub transferable: Option<bool>,
    pub burnable: Option<bool>,
    pub paid_price: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct Scarce {
    pub owner_id: AccountId,
    pub creator_id: AccountId,
    pub minter_id: AccountId,
    pub metadata: TokenMetadata,
    pub approved_account_ids: std::collections::HashMap<AccountId, u64>,
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    #[serde(default)]
    pub revoked_at: Option<u64>,
    #[serde(default)]
    pub revocation_memo: Option<String>,
    #[serde(default)]
    pub redeemed_at: Option<u64>,
    #[serde(default)]
    pub redeem_count: u32,
    #[serde(default)]
    pub paid_price: u128,
    #[serde(default)]
    pub refunded: bool,
    #[serde(default)]
    pub transferable: Option<bool>,
    #[serde(default)]
    pub burnable: Option<bool>,
    #[serde(default)]
    pub app_id: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct TokenStatus {
    pub token_id: String,
    pub owner_id: AccountId,
    pub creator_id: AccountId,
    pub minter_id: AccountId,
    pub collection_id: Option<String>,
    pub metadata: TokenMetadata,
    pub royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub is_valid: bool,
    pub is_revoked: bool,
    pub revoked_at: Option<u64>,
    pub revocation_memo: Option<String>,
    pub is_expired: bool,
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
    pub is_fully_redeemed: bool,
    pub redeemed_at: Option<u64>,
    pub is_refunded: bool,
    pub paid_price: U128,
}

#[near(serializers = [json])]
pub struct RedeemInfo {
    pub redeem_count: u32,
    pub max_redeems: Option<u32>,
}

#[near(serializers = [json])]
#[derive(Clone)]
pub struct TransferItem {
    pub receiver_id: AccountId,
    pub token_id: String,
    pub memo: Option<String>,
}
