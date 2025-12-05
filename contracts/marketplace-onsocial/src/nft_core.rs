// NEP-171 NFT Core Implementation
// Native NFT functionality for lazy-minted collections

use crate::*;
use near_sdk::{require, serde_json};
use std::collections::HashMap;

impl Contract {
    /// Internal: Mint a new native token
    pub(crate) fn internal_mint(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        metadata: TokenMetadata,
    ) -> String {
        // Validate token ID
        require!(
            token_id.len() <= MAX_TOKEN_ID_LEN,
            format!("Token ID exceeds max length of {}", MAX_TOKEN_ID_LEN)
        );
        
        // Validate metadata size (critical: must use expect() to prevent bypass)
        let metadata_json = serde_json::to_string(&metadata)
            .expect("Failed to serialize metadata - invalid JSON structure");
        let metadata_size = metadata_json.len();
        require!(
            metadata_size <= MAX_METADATA_LEN,
            format!("Metadata exceeds max length of {} bytes (got {} bytes)", MAX_METADATA_LEN, metadata_size)
        );
        
        // Ensure token doesn't already exist
        require!(
            !self.native_tokens_by_id.contains_key(&token_id),
            "Token ID already exists"
        );
        
        // Create token
        let token = NativeToken {
            owner_id: owner_id.clone(),
            metadata,
            approved_account_ids: HashMap::new(),
        };
        
        // Store token
        self.native_tokens_by_id.insert(token_id.clone(), token);
        
        // Add to owner's tokens - get or create
        if !self.native_tokens_per_owner.contains_key(&owner_id) {
            self.native_tokens_per_owner.insert(
                owner_id.clone(),
                IterableSet::new(StorageKey::NativeTokensPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                }),
            );
        }
        
        // Now insert the token (set is guaranteed to exist)
        self.native_tokens_per_owner
            .get_mut(&owner_id)
            .unwrap()
            .insert(token_id.clone());
        
        token_id
    }
    
    /// Internal: Transfer native token
    pub(crate) fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        let mut token = self
            .native_tokens_by_id
            .get(token_id)
            .expect("Token not found")
            .clone();
        
        // Check authorization
        if sender_id != &token.owner_id {
            // Check if sender is approved
            if let Some(approved_id) = approval_id {
                let actual_approval_id = token
                    .approved_account_ids
                    .get(sender_id)
                    .expect("Sender not approved");
                
                require!(
                    approved_id == *actual_approval_id,
                    "Invalid approval ID"
                );
            } else {
                panic!("Sender not authorized to transfer token");
            }
        }
        
        // Remove from sender's tokens
        if let Some(sender_tokens) = self.native_tokens_per_owner.get_mut(&token.owner_id) {
            sender_tokens.remove(token_id);
            // Check if empty and remove the whole set
            if sender_tokens.is_empty() {
                let owner_id = token.owner_id.clone();
                self.native_tokens_per_owner.remove(&owner_id);
            }
        }
        
        // Update token owner and clear approvals
        token.owner_id = receiver_id.clone();
        token.approved_account_ids.clear();
        
        // Add to receiver's tokens - get or create
        if !self.native_tokens_per_owner.contains_key(receiver_id) {
            self.native_tokens_per_owner.insert(
                receiver_id.clone(),
                IterableSet::new(StorageKey::NativeTokensPerOwnerInner {
                    account_id_hash: env::sha256(receiver_id.as_bytes()),
                }),
            );
        }
        
        // Now insert the token (set is guaranteed to exist)
        self.native_tokens_per_owner
            .get_mut(receiver_id)
            .unwrap()
            .insert(token_id.to_string());
        
        // Save updated token
        self.native_tokens_by_id.insert(token_id.to_string(), token);
        
        // Log event
        if let Some(memo_str) = memo {
            env::log_str(&format!(
                "Transfer: {} transferred token {} to {} - {}",
                sender_id, token_id, receiver_id, memo_str
            ));
        } else {
            env::log_str(&format!(
                "Transfer: {} transferred token {} to {}",
                sender_id, token_id, receiver_id
            ));
        }
    }
    
    /// Batch mint multiple tokens (for collections)
    pub(crate) fn internal_batch_mint(
        &mut self,
        owner_id: &AccountId,
        token_ids: Vec<String>,
        metadata_template: &str,
        collection_id: &str,
    ) -> Vec<String> {
        require!(
            token_ids.len() as u32 <= MAX_BATCH_MINT,
            format!("Cannot mint more than {} tokens at once", MAX_BATCH_MINT)
        );
        
        let mut minted_tokens = Vec::new();
        
        for (index, token_id) in token_ids.iter().enumerate() {
            // Generate metadata from template
            let metadata = self.generate_metadata_from_template(
                metadata_template,
                token_id,
                index as u32,
                owner_id,
                collection_id,
            );
            
            // Mint token
            let minted_id = self.internal_mint(
                token_id.clone(),
                owner_id.clone(),
                metadata,
            );
            
            minted_tokens.push(minted_id);
        }
        
        minted_tokens
    }
    
    /// Generate metadata from template with placeholder replacement
    pub(crate) fn generate_metadata_from_template(
        &self,
        template: &str,
        token_id: &str,
        index: u32,
        owner: &AccountId,
        collection_id: &str,
    ) -> TokenMetadata {
        // Parse template
        let mut metadata: TokenMetadata = serde_json::from_str(template)
            .expect("Invalid metadata template");
        
        let seat_number = index + 1;
        let timestamp = env::block_timestamp();
        
        // Replace placeholders in title
        if let Some(ref mut title) = metadata.title {
            *title = title
                .replace("{token_id}", token_id)
                .replace("{index}", &index.to_string())
                .replace("{seat_number}", &seat_number.to_string())
                .replace("{collection_id}", collection_id);
        }
        
        // Replace placeholders in description
        if let Some(ref mut description) = metadata.description {
            *description = description
                .replace("{token_id}", token_id)
                .replace("{index}", &index.to_string())
                .replace("{seat_number}", &seat_number.to_string())
                .replace("{collection_id}", collection_id)
                .replace("{owner}", owner.as_str());
        }
        
        // Replace placeholders in extra JSON
        if let Some(ref mut extra) = metadata.extra {
            *extra = extra
                .replace("{token_id}", token_id)
                .replace("{index}", &index.to_string())
                .replace("{seat_number}", &seat_number.to_string())
                .replace("{collection_id}", collection_id)
                .replace("{owner}", owner.as_str())
                .replace("{minted_at}", &timestamp.to_string());
        }
        
        // Set timestamps
        metadata.issued_at = Some(timestamp);
        
        metadata
    }
}

// NEP-171 Public API
#[near]
impl Contract {
    /// Transfer token to another account
    #[payable]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        
        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo);
    }
    
    /// Transfer token and call receiver contract (NEP-171)
    /// Optional gas overrides for receiver callback and resolution
    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
        receiver_gas_tgas: Option<u64>,
        resolve_gas_tgas: Option<u64>,
    ) -> Promise {
        assert_one_yocto();
        let sender_id = env::predecessor_account_id();
        
        // Store token data before transfer for potential revert
        let token = self.native_tokens_by_id.get(&token_id).expect("Token not found");
        let previous_owner_id = token.owner_id.clone();
        let previous_approvals = token.approved_account_ids.clone();
        
        // Execute transfer
        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo);
        
        // Use provided gas or sensible defaults
        let receiver_gas = Gas::from_tgas(receiver_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
        let resolve_gas = Gas::from_tgas(resolve_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
        
        // Call nft_on_transfer on receiver and resolve
        external::ext_nft_transfer_receiver::ext(receiver_id.clone())
            .with_static_gas(receiver_gas)
            .nft_on_transfer(
                sender_id.clone(),
                previous_owner_id.clone(),
                token_id.clone(),
                msg,
            )
            .then(
                external::ext_self::ext(env::current_account_id())
                    .with_static_gas(resolve_gas)
                    .nft_resolve_transfer(
                        previous_owner_id,
                        receiver_id,
                        token_id,
                        Some(previous_approvals),
                    )
            )
    }
    
    /// Resolve transfer after callback (NEP-171)
    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool {
        // Check callback result from nft_on_transfer
        let should_revert = match env::promise_result(0) {
            near_sdk::PromiseResult::Successful(value) => {
                // Deserialize boolean result
                near_sdk::serde_json::from_slice::<bool>(&value).unwrap_or(false)
            }
            _ => {
                // If callback failed or panicked, don't revert the transfer
                false
            }
        };
        
        if should_revert {
            // Revert the transfer - move token back to previous owner
            env::log_str(&format!(
                "Transfer reverted: {} rejected token {}",
                receiver_id, token_id
            ));
            
            let mut token = self.native_tokens_by_id.get(&token_id).expect("Token not found").clone();
            
            // Remove from receiver
            if let Some(receiver_tokens) = self.native_tokens_per_owner.get_mut(&receiver_id) {
                receiver_tokens.remove(&token_id);
                if receiver_tokens.is_empty() {
                    self.native_tokens_per_owner.remove(&receiver_id);
                }
            }
            
            // Restore to previous owner
            token.owner_id = previous_owner_id.clone();
            if let Some(approvals) = approved_account_ids {
                token.approved_account_ids = approvals;
            }
            
            // Add back to previous owner's tokens
            if !self.native_tokens_per_owner.contains_key(&previous_owner_id) {
                self.native_tokens_per_owner.insert(
                    previous_owner_id.clone(),
                    IterableSet::new(StorageKey::NativeTokensPerOwnerInner {
                        account_id_hash: env::sha256(previous_owner_id.as_bytes()),
                    }),
                );
            }
            self.native_tokens_per_owner
                .get_mut(&previous_owner_id)
                .unwrap()
                .insert(token_id.clone());
            
            // Save reverted token
            self.native_tokens_by_id.insert(token_id, token);
            
            true // Transfer was reverted
        } else {
            // Transfer is confirmed
            env::log_str(&format!(
                "Transfer confirmed: {} accepted token {}",
                receiver_id, token_id
            ));
            
            false // Transfer was not reverted
        }
    }
    
    /// Get token information
    pub fn nft_token(&self, token_id: String) -> Option<external::Token> {
        self.native_tokens_by_id.get(&token_id).map(|token| {
            external::Token {
                token_id: token_id.clone(),
                owner_id: token.owner_id.clone(),
                metadata: Some(token.metadata.clone()),
                approved_account_ids: Some(token.approved_account_ids.clone()),
            }
        })
    }
}

// Helper functions
fn assert_one_yocto() {
    require!(
        env::attached_deposit() == ONE_YOCTO,
        "Requires attached deposit of exactly 1 yoctoNEAR"
    );
}
