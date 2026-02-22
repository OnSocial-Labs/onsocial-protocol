#![allow(dead_code)]

use crate::Payout;
use near_sdk::json_types::{Base64VecU8, U128};
use near_sdk::{ext_contract, near, AccountId};

#[near(serializers = [json])]
#[derive(Clone)]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<crate::TokenMetadata>,
    pub approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
}

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

    fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool;
}

#[ext_contract(ext_wrap)]
pub trait ExtWrap {
    /// Cross-contract assumption: unwrap burns wNEAR and releases equivalent native NEAR to caller.
    fn near_withdraw(&mut self, amount: U128);
}

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

#[ext_contract(ext_scarce_transfer_receiver)]
pub trait ExtScarceTransferReceiver {
    /// Cross-contract assumption: `true` rejects/reverts transfer, `false` accepts transfer.
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> bool;
}
