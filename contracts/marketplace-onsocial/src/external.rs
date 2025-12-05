// External contract interfaces for cross-contract calls

use crate::Payout;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{ext_contract, AccountId};

/// NFT Token structure (NEP-171)
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct Token {
    pub token_id: String,
    pub owner_id: AccountId,
    pub metadata: Option<crate::TokenMetadata>,
    pub approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
}

/// NFT Token Metadata (NEP-177) - for external NFT contracts
/// Note: Internal tokens use crate::TokenMetadata from lib.rs
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct ExternalTokenMetadata {
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

/// NFT Contract Metadata (NEP-177)
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct NFTContractMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub base_uri: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
}

/// External NFT contract interface
#[ext_contract(ext_nft_contract)]
pub trait ExtNftContract {
    // NEP-171 Core
    /// Transfer NFT with payout (NEP-171 + NEP-199)
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
    /// Get NFT token with metadata
    fn nft_token(&self, token_id: String) -> Option<Token>;
    
    /// Get NFT contract metadata
    fn nft_metadata(&self) -> NFTContractMetadata;
    
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

/// Sale with NFT metadata combined (used in callbacks)
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
#[derive(near_sdk::NearSchema)]
pub struct SaleWithMetadata {
    pub sale: crate::Sale,
    pub nft_token: Option<Token>,
}

/// Self callback interface
#[ext_contract(ext_self)]
pub trait ExtSelf {
    /// Resolve purchase after NFT transfer
    fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        nft_contract_id: AccountId,
        token_id: String,
    ) -> U128;
    
    /// Process listing after verification
    fn process_listing(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        owner_id: AccountId,
    );
    
    /// Resolve sale with metadata callback
    fn resolve_sale_with_metadata(
        &self,
        nft_contract_id: AccountId,
        token_id: String,
    ) -> Option<SaleWithMetadata>;
    
    /// Resolve NFT transfer (NEP-171 callback)
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
#[ext_contract(ext_nft_approval_receiver)]
pub trait ExtNftApprovalReceiver {
    /// Called when an NFT is approved
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
/// Contracts that want to receive NFT transfers implement this
#[ext_contract(ext_nft_transfer_receiver)]
pub trait ExtNftTransferReceiver {
    /// Called when an NFT is transferred via nft_transfer_call
    /// Returns true if the transfer should be reverted
    fn nft_on_transfer(
        &mut self,
        sender_id: AccountId,
        previous_owner_id: AccountId,
        token_id: String,
        msg: String,
    ) -> bool; // true = revert, false = keep
}
