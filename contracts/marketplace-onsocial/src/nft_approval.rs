// NEP-178 Approval Management Implementation
// Allows marketplace to transfer NFTs on behalf of owners

use crate::*;
use near_sdk::require;

#[near]
impl Contract {
    /// Approve an account to transfer a specific token (NEP-178)
    /// Optional gas override for callback
    #[payable]
    pub fn nft_approve(
        &mut self,
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
        callback_gas_tgas: Option<u64>,
    ) -> Option<Promise> {
        assert_at_least_one_yocto();
        
        let token = self
            .native_tokens_by_id
            .get(&token_id)
            .expect("Token not found");
        
        let owner_id = env::predecessor_account_id();
        require!(
            token.owner_id == owner_id,
            "Only token owner can approve"
        );
        
        // Generate new approval ID
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;
        
        // Clone token, add approval, and save
        let mut token = token.clone();
        token.approved_account_ids.insert(account_id.clone(), approval_id);
        self.native_tokens_by_id.insert(token_id.clone(), token);
        
        env::log_str(&format!(
            "Approved: {} approved {} for token {} (approval_id: {})",
            owner_id, account_id, token_id, approval_id
        ));
        
        // If msg provided, call nft_on_approve on approved account (NEP-178)
        if let Some(msg_str) = msg {
            // Use provided gas or sensible default (50 TGas)
            let callback_gas = Gas::from_tgas(callback_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
            
            // Make cross-contract call to approved account
            Some(
                external::ext_nft_approval_receiver::ext(account_id)
                    .with_static_gas(callback_gas)
                    .nft_on_approve(
                        token_id,
                        owner_id,
                        approval_id,
                        msg_str,
                    )
            )
        } else {
            None
        }
    }
    
    /// Revoke approval for specific account (NEP-178)
    #[payable]
    pub fn nft_revoke(&mut self, token_id: String, account_id: AccountId) {
        assert_one_yocto();
        
        let token = self
            .native_tokens_by_id
            .get(&token_id)
            .expect("Token not found");
        
        let owner_id = env::predecessor_account_id();
        require!(
            token.owner_id == owner_id,
            "Only token owner can revoke approval"
        );
        
        let mut token = token.clone();
        token.approved_account_ids.remove(&account_id);
        self.native_tokens_by_id.insert(token_id.clone(), token);
        
        env::log_str(&format!(
            "Revoked: {} revoked approval for {} on token {}",
            owner_id, account_id, token_id
        ));
    }
    
    /// Revoke all approvals for a token (NEP-178)
    #[payable]
    pub fn nft_revoke_all(&mut self, token_id: String) {
        assert_one_yocto();
        
        let token = self
            .native_tokens_by_id
            .get(&token_id)
            .expect("Token not found");
        
        let owner_id = env::predecessor_account_id();
        require!(
            token.owner_id == owner_id,
            "Only token owner can revoke all approvals"
        );
        
        let mut token = token.clone();
        token.approved_account_ids.clear();
        self.native_tokens_by_id.insert(token_id, token);
        
        env::log_str(&format!(
            "Revoked all: {} revoked all approvals on token",
            owner_id
        ));
    }
    
    /// Check if account is approved (NEP-178)
    pub fn nft_is_approved(
        &self,
        token_id: String,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        let token = match self.native_tokens_by_id.get(&token_id) {
            Some(t) => t,
            None => return false,
        };
        
        match token.approved_account_ids.get(&approved_account_id) {
            Some(actual_approval_id) => {
                if let Some(expected_id) = approval_id {
                    *actual_approval_id == expected_id
                } else {
                    true
                }
            }
            None => false,
        }
    }
}

fn assert_at_least_one_yocto() {
    require!(
        env::attached_deposit() >= ONE_YOCTO,
        "Requires attached deposit of at least 1 yoctoNEAR"
    );
}

fn assert_one_yocto() {
    require!(
        env::attached_deposit() == ONE_YOCTO,
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}
