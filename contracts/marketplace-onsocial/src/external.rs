// External contract interfaces for cross-contract calls
//
// `#[ext_contract]` generates helper structs that the compiler flags as dead_code
// even though they are used at runtime for cross-contract calls.
#![allow(dead_code)]

use crate::Payout;
use near_sdk::json_types::U128;
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

/// Scarce Token Metadata (NEP-177) - for external Scarce contracts
/// Note: Internal tokens use crate::TokenMetadata from lib.rs
#[near(serializers = [json])]
#[derive(Clone)]
pub struct ExternalScarceMetadata {
    pub title: Option<String>,
    pub description: Option<String>,
    pub media: Option<String>,
    pub media_hash: Option<String>,
    pub copies: Option<u64>,
    pub issued_at: Option<u64>,
    pub expires_at: Option<u64>,
    pub starts_at: Option<u64>,
    pub updated_at: Option<u64>,
    pub extra: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
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
    pub reference_hash: Option<String>,
}

impl Default for ScarceContractMetadata {
    fn default() -> Self {
        Self {
            spec: "nft-1.0.0".to_string(),
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
    // NEP-171 Core
    /// Transfer Scarce with payout (NEP-171 + NEP-199)
    fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: u64,
        memo: Option<String>,
        balance: U128,
        max_len_payout: u32,
    ) -> Payout;

    /// Get token owner (NEP-171)
    fn nft_token_owner(&self, token_id: String) -> AccountId;

    // NEP-178 Approval Management
    /// Check if account is approved for token
    fn nft_is_approved(
        &self,
        token_id: String,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool;

    // NEP-177 Metadata
    /// Get Scarce token with metadata
    fn nft_token(&self, token_id: String) -> Option<Token>;

    /// Get Scarce contract metadata
    fn nft_metadata(&self) -> ScarceContractMetadata;

    // NEP-181 Enumeration
    /// Get paginated list of all tokens
    fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token>;

    /// Get paginated list of tokens for an owner
    fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<Token>;

    /// Get total supply of tokens
    fn nft_total_supply(&self) -> U128;

    /// Get supply of tokens for an owner
    fn nft_supply_for_owner(&self, account_id: AccountId) -> U128;
}

/// Sale with Scarce metadata combined (used in callbacks)
#[near(serializers = [json])]
pub struct SaleWithMetadata {
    pub sale: crate::Sale,
    pub scarce_token: Option<Token>,
}

/// Self callback interface
#[ext_contract(ext_self)]
pub trait ExtSelf {
    /// Resolve purchase after Scarce transfer
    fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> U128;

    /// Process listing after verification
    fn process_listing(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        owner_id: AccountId,
    );

    /// Resolve sale with metadata callback
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
/// Contracts that want to be notified of approvals implement this
#[ext_contract(ext_scarce_approval_receiver)]
pub trait ExtScarceApprovalReceiver {
    /// Called when a Scarce is approved
    /// Returns a promise that the receiver should handle the approval
    fn nft_on_approve(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    );
}

/// NEP-171 Transfer receiver interface
/// Contracts that want to receive Scarce transfers implement this
#[ext_contract(ext_scarce_transfer_receiver)]
pub trait ExtScarceTransferReceiver {
    /// Called when a Scarce is transferred via nft_transfer_call
    /// Returns true if the transfer should be reverted
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> bool; // true = revert, false = keep
}
