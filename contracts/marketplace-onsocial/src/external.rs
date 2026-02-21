// `#[ext_contract]` generates helper structs that the compiler flags as dead_code
// even though they are used at runtime for cross-contract calls.
#![allow(dead_code)]

use crate::Payout;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{ext_contract, near, AccountId};

/// Scarce Token structure (NEP-171)
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<crate::TokenMetadata>,
    pub approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
}

/// Scarce Contract Metadata (NEP-177)
#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct ScarceContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<Base64VecU8>,
}

impl Default for ScarceContractMetadata {
    fn default() -> Self {
        Self {
            spec: "nft-2.0.0".to_string(),
            name: "OnSocial Scarces".to_string(),
            symbol: "SCARCE".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

/// External Scarce contract interface
#[ext_contract(ext_scarce_contract)]
pub trait ExtScarceContract {
    fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: u64,
        memo: Option<String>,
        balance: U128,
        max_len_payout: u32,
    ) -> Payout;

    fn nft_is_approved(
        &self,
        token_id: String,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool;

    fn nft_token(&self, token_id: String) -> Option<Token>;
    fn nft_metadata(&self) -> ScarceContractMetadata;
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>;
    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token>;

    fn nft_total_supply(&self) -> U128;
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128;
}

#[near(serializers = [json])]
pub struct SaleWithMetadata {
    pub sale: crate::Sale,
    pub scarce_token: Option<Token>,
}

/// Self callback interface
#[ext_contract(ext_self)]
pub trait ExtSelf {
    fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        deposit: U128,
        scarce_contract_id: AccountId,
        token_id: String,
        seller_id: AccountId,
    ) -> U128;

    fn process_listing(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        owner_id: AccountId,
    );

    fn resolve_sale_with_metadata(
        &self,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> Option<SaleWithMetadata>;

    /// Resolve Scarce transfer (NEP-171 callback)
    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool;
}

/// NEP-178 Approval receiver interface
#[ext_contract(ext_scarce_approval_receiver)]
pub trait ExtScarceApprovalReceiver {
    fn nft_on_approve(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    );
}

/// NEP-171 Transfer receiver interface
#[ext_contract(ext_scarce_transfer_receiver)]
pub trait ExtScarceTransferReceiver {
    /// Returns `true` to revert the transfer, `false` to accept.
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> bool;
}
