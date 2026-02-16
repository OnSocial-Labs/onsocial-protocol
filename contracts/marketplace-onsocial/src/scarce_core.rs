// NEP-171 Scarce Core Implementation
// Native Scarce functionality for lazy-minted collections

use crate::internal::check_one_yocto;
use crate::*;
use near_sdk::serde_json;
use std::collections::HashMap;

impl Contract {
    /// Internal: Mint a new native token
    pub(crate) fn internal_mint(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        metadata: TokenMetadata,
    ) -> Result<String, MarketplaceError> {
        // Validate token ID
        if token_id.len() > MAX_TOKEN_ID_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Token ID exceeds max length of {}", MAX_TOKEN_ID_LEN
            )));
        }

        // Validate metadata size
        let metadata_json = serde_json::to_string(&metadata)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize metadata".into()))?;
        let metadata_size = metadata_json.len();
        if metadata_size > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes (got {} bytes)",
                MAX_METADATA_LEN, metadata_size
            )));
        }

        // Ensure token doesn't already exist
        if self.scarces_by_id.contains_key(&token_id) {
            return Err(MarketplaceError::InvalidState("Token ID already exists".into()));
        }

        // Create token
        let token = Scarce {
            owner_id: owner_id.clone(),
            metadata,
            approved_account_ids: HashMap::new(),
            royalty: None,
            revoked_at: None,
            revocation_memo: None,
            redeemed_at: None,
            redeem_count: 0,
            paid_price: 0,
            refunded: false,
        };

        // Store token
        self.scarces_by_id.insert(token_id.clone(), token);

        // Add to owner's tokens - get or create
        if !self.scarces_per_owner.contains_key(&owner_id) {
            self.scarces_per_owner.insert(
                owner_id.clone(),
                IterableSet::new(StorageKey::ScarcesPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                }),
            );
        }

        // Now insert the token (set is guaranteed to exist)
        self.scarces_per_owner
            .get_mut(&owner_id)
            .unwrap()
            .insert(token_id.clone());

        Ok(token_id)
    }

    /// Internal: Transfer native token
    pub(crate) fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        // Block transfers of revoked (invalidated) tokens
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState("Cannot transfer a revoked token".into()));
        }

        // Block transfers of soulbound (non-transferable) tokens
        let collection_id = crate::collection_id_from_token_id(token_id);
        if !collection_id.is_empty() {
            if let Some(collection) = self.collections.get(collection_id) {
                if !collection.transferable {
                    return Err(MarketplaceError::InvalidState(
                        "Token is non-transferable (soulbound)".into(),
                    ));
                }
            }
        }

        // Check authorization
        if sender_id != &token.owner_id {
            // Check if sender is approved
            if let Some(approved_id) = approval_id {
                let actual_approval_id = token
                    .approved_account_ids
                    .get(sender_id)
                    .ok_or_else(|| MarketplaceError::Unauthorized("Sender not approved".into()))?;

                if approved_id != *actual_approval_id {
                    return Err(MarketplaceError::Unauthorized("Invalid approval ID".into()));
                }
            } else {
                return Err(MarketplaceError::Unauthorized(
                    "Sender not authorized to transfer token".into(),
                ));
            }
        }

        // Remove from sender's tokens
        if let Some(sender_tokens) = self.scarces_per_owner.get_mut(&token.owner_id) {
            sender_tokens.remove(token_id);
            // Check if empty and remove the whole set
            if sender_tokens.is_empty() {
                let owner_id = token.owner_id.clone();
                self.scarces_per_owner.remove(&owner_id);
            }
        }

        // Update token owner and clear approvals
        token.owner_id = receiver_id.clone();
        token.approved_account_ids.clear();

        // Add to receiver's tokens - get or create
        if !self.scarces_per_owner.contains_key(receiver_id) {
            self.scarces_per_owner.insert(
                receiver_id.clone(),
                IterableSet::new(StorageKey::ScarcesPerOwnerInner {
                    account_id_hash: env::sha256(receiver_id.as_bytes()),
                }),
            );
        }

        // Now insert the token (set is guaranteed to exist)
        self.scarces_per_owner
            .get_mut(receiver_id)
            .unwrap()
            .insert(token_id.to_string());

        // Save updated token
        self.scarces_by_id.insert(token_id.to_string(), token);

        // Auto-delist from any active sale (prevents stale listings)
        self.internal_remove_sale_listing(token_id, sender_id);

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
        Ok(())
    }

    /// Batch mint multiple tokens (for collections)
    pub(crate) fn internal_batch_mint(
        &mut self,
        owner_id: &AccountId,
        token_ids: Vec<String>,
        metadata_template: &str,
        collection_id: &str,
        royalty: Option<&std::collections::HashMap<AccountId, u32>>,
    ) -> Result<Vec<String>, MarketplaceError> {
        if token_ids.is_empty() || token_ids.len() as u32 > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Cannot mint more than {} tokens at once", MAX_BATCH_MINT
            )));
        }

        let mut minted_tokens = Vec::new();

        for (index, token_id) in token_ids.iter().enumerate() {
            // Generate metadata from template
            let metadata = self.generate_metadata_from_template(
                metadata_template,
                token_id,
                index as u32,
                owner_id,
                collection_id,
            )?;

            // Mint token
            let minted_id = self.internal_mint(token_id.clone(), owner_id.clone(), metadata)?;

            // Set royalty on minted token if collection has one
            if let Some(r) = royalty {
                if let Some(mut scarce) = self.scarces_by_id.remove(&minted_id) {
                    scarce.royalty = Some(r.clone());
                    self.scarces_by_id.insert(minted_id.clone(), scarce);
                }
            }

            minted_tokens.push(minted_id);
        }

        Ok(minted_tokens)
    }

    /// Generate metadata from template with placeholder replacement
    pub(crate) fn generate_metadata_from_template(
        &self,
        template: &str,
        token_id: &str,
        index: u32,
        owner: &AccountId,
        collection_id: &str,
    ) -> Result<TokenMetadata, MarketplaceError> {
        // Parse template
        let mut metadata: TokenMetadata =
            serde_json::from_str(template).map_err(|_| {
                MarketplaceError::InvalidInput("Invalid metadata template".into())
            })?;

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

        Ok(metadata)
    }
}

// NEP-171 Public API
#[near]
impl Contract {
    /// Owner voluntarily burns their own token. Requires collection.burnable == true.
    #[payable]
    #[handle_result]
    pub fn burn_scarce(&mut self, token_id: String, collection_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_burn_scarce(&caller, &token_id, &collection_id)
    }

    /// Transfer token to another account
    #[payable]
    #[handle_result]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let sender_id = env::predecessor_account_id();

        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)
    }

    /// Transfer token and call receiver contract (NEP-171)
    /// Optional gas overrides via `gas_overrides` parameter.
    #[payable]
    #[handle_result]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
        gas_overrides: Option<GasOverrides>,
    ) -> Result<Promise, MarketplaceError> {
        check_one_yocto()?;
        let sender_id = env::predecessor_account_id();

        // Store token data before transfer for potential revert
        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        let previous_owner_id = token.owner_id.clone();
        let previous_approvals = token.approved_account_ids.clone();

        // Execute transfer
        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)?;

        // Use provided gas or sensible defaults
        let overrides = gas_overrides.unwrap_or(GasOverrides {
            receiver_tgas: None,
            resolve_tgas: None,
        });
        let receiver_gas = Gas::from_tgas(overrides.receiver_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
        let resolve_gas = Gas::from_tgas(overrides.resolve_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));

        // Call nft_on_transfer on receiver and resolve
        Ok(external::ext_scarce_transfer_receiver::ext(receiver_id.clone())
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
                    ),
            ))
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
        let should_revert = match env::promise_result_checked(0, 16) {
            Ok(value) => {
                // Deserialize boolean result
                near_sdk::serde_json::from_slice::<bool>(&value).unwrap_or(false)
            }
            Err(_) => {
                // If callback failed or panicked, don't revert the transfer
                false
            }
        };

        if should_revert {
            // Revert the transfer - move token back to previous owner
            // SAFETY: callback must not panic — if token was re-transferred or burned
            // during the callback window, log and accept the transfer as final.
            let token_opt = self.scarces_by_id.get(&token_id).cloned();
            let mut token = match token_opt {
                Some(t) => t,
                None => {
                    env::log_str(&format!(
                        "Cannot revert transfer: token {} no longer exists",
                        token_id
                    ));
                    return false;
                }
            };

            // If the token was re-transferred to a third party, don't revert
            if token.owner_id != receiver_id {
                env::log_str(&format!(
                    "Cannot revert transfer: token {} now owned by {}, not {}",
                    token_id, token.owner_id, receiver_id
                ));
                return false;
            }

            env::log_str(&format!(
                "Transfer reverted: {} rejected token {}",
                receiver_id, token_id
            ));

            // Remove from receiver
            if let Some(receiver_tokens) = self.scarces_per_owner.get_mut(&receiver_id) {
                receiver_tokens.remove(&token_id);
                if receiver_tokens.is_empty() {
                    self.scarces_per_owner.remove(&receiver_id);
                }
            }

            // Restore to previous owner
            token.owner_id = previous_owner_id.clone();
            if let Some(approvals) = approved_account_ids {
                token.approved_account_ids = approvals;
            }

            // Add back to previous owner's tokens
            if !self
                .scarces_per_owner
                .contains_key(&previous_owner_id)
            {
                self.scarces_per_owner.insert(
                    previous_owner_id.clone(),
                    IterableSet::new(StorageKey::ScarcesPerOwnerInner {
                        account_id_hash: env::sha256(previous_owner_id.as_bytes()),
                    }),
                );
            }
            self.scarces_per_owner
                .get_mut(&previous_owner_id)
                .unwrap()
                .insert(token_id.clone());

            // Save reverted token
            self.scarces_by_id.insert(token_id, token);

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
        self.scarces_by_id
            .get(&token_id)
            .map(|token| external::Token {
                token_id: token_id.clone(),
                owner_id: token.owner_id.clone(),
                metadata: Some(token.metadata.clone()),
                approved_account_ids: Some(token.approved_account_ids.clone()),
            })
    }
}

// ── Batch transfer ───────────────────────────────────────────────────────────

impl Contract {
    /// Batch transfer multiple native scarces in one call.
    /// Each transfer is independent — if one fails, the entire batch panics.
    /// Max MAX_BATCH_TRANSFER transfers per call.
    pub(crate) fn internal_batch_transfer(
        &mut self,
        actor_id: &AccountId,
        transfers: Vec<crate::protocol::TransferItem>,
    ) -> Result<(), MarketplaceError> {
        if transfers.is_empty() || transfers.len() as u32 > MAX_BATCH_TRANSFER {
            return Err(MarketplaceError::InvalidInput(format!(
                "Batch size must be 1-{}", MAX_BATCH_TRANSFER
            )));
        }

        for item in &transfers {
            self.internal_transfer(
                actor_id,
                &item.receiver_id,
                &item.token_id,
                None,
                item.memo.clone(),
            )?;
            events::emit_scarce_transfer(
                actor_id,
                &item.receiver_id,
                &item.token_id,
                item.memo.as_deref(),
            );
        }
        Ok(())
    }
}
