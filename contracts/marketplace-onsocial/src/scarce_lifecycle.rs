// Token Lifecycle: Renewal, Revocation, Redemption, and Burn
//
// Extracted from scarce_core.rs to separate domain-specific lifecycle
// operations from NEP-171 core token mechanics.

use crate::*;

// ── Token Lifecycle: Renewal & Revocation ────────────────────────────────────

impl Contract {
    /// Renew a native scarce's expiry date.
    /// Only the collection creator or the app owner can renew.
    pub(crate) fn internal_renew_token(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
        new_expires_at: u64,
    ) -> Result<(), MarketplaceError> {
        // Validate token belongs to collection
        check_token_in_collection(token_id, collection_id)?;

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        if !collection.renewable {
            return Err(MarketplaceError::InvalidState("Collection is not renewable".into()));
        }

        self.check_collection_authority(actor_id, collection)?;

        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        if new_expires_at <= env::block_timestamp() {
            return Err(MarketplaceError::InvalidInput("New expiry must be in the future".into()));
        }

        let owner_id = token.owner_id.clone();
        token.metadata.expires_at = Some(new_expires_at);
        self.scarces_by_id.insert(token_id.to_string(), token);

        events::emit_token_renewed(actor_id, token_id, collection_id, &owner_id, new_expires_at);
        Ok(())
    }

    /// Revoke a native scarce using the collection's revocation mode.
    /// - `Invalidate`: marks token with `revoked_at` + memo, keeps on-chain.
    /// - `Burn`: hard-deletes token from storage.
    ///   Only the collection creator or the app owner can revoke.
    pub(crate) fn internal_revoke_token(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        // Validate token belongs to collection
        check_token_in_collection(token_id, collection_id)?;

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        if collection.revocation_mode == RevocationMode::None {
            return Err(MarketplaceError::InvalidState("Collection tokens are irrevocable".into()));
        }

        self.check_collection_authority(actor_id, collection)?;

        match collection.revocation_mode {
            RevocationMode::Invalidate => {
                let mut token = self
                    .scarces_by_id
                    .get(token_id)
                    .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
                    .clone();

                if token.revoked_at.is_some() {
                    return Err(MarketplaceError::InvalidState("Token is already revoked".into()));
                }

                let owner_id = token.owner_id.clone();
                token.revoked_at = Some(env::block_timestamp());
                token.revocation_memo = memo.clone();
                // Clear approvals — revoked tokens shouldn't be tradeable
                token.approved_account_ids.clear();
                self.scarces_by_id.insert(token_id.to_string(), token);

                // Remove from any active sale
                self.internal_remove_sale_listing(token_id, &owner_id);

                events::emit_token_revoked(
                    actor_id, token_id, collection_id, &owner_id,
                    "invalidate", memo.as_deref(),
                );
            }
            RevocationMode::Burn => {
                let token = self
                    .scarces_by_id
                    .remove(token_id)
                    .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
                let owner_id = token.owner_id.clone();

                // Remove from owner's set
                if let Some(owner_tokens) = self.scarces_per_owner.get_mut(&owner_id) {
                    owner_tokens.remove(token_id);
                    if owner_tokens.is_empty() {
                        self.scarces_per_owner.remove(&owner_id);
                    }
                }

                // Remove from any active sale
                self.internal_remove_sale_listing(token_id, &owner_id);

                events::emit_token_revoked(
                    actor_id, token_id, collection_id, &owner_id,
                    "burn", memo.as_deref(),
                );
            }
            RevocationMode::None => unreachable!(),
        }
        Ok(())
    }

    /// Remove a native scarce's sale listing (if any).
    /// Cleans up empty sets to prevent storage leaks.
    pub(crate) fn internal_remove_sale_listing(&mut self, token_id: &str, owner_id: &AccountId) {
        let sale_id = Self::make_sale_id(&env::current_account_id(), token_id);
        if self.sales.contains_key(&sale_id) {
            self.sales.remove(&sale_id);
            if let Some(owner_sales) = self.by_owner_id.get_mut(owner_id) {
                owner_sales.remove(&sale_id);
                if owner_sales.is_empty() {
                    self.by_owner_id.remove(owner_id);
                }
            }
            let contract_id = env::current_account_id();
            if let Some(contract_sales) = self.by_scarce_contract_id.get_mut(&contract_id) {
                contract_sales.remove(&sale_id);
                if contract_sales.is_empty() {
                    self.by_scarce_contract_id.remove(&contract_id);
                }
            }
        }
    }

    /// Redeem (check-in / use) a token.
    /// Only the collection creator or the app owner can redeem.
    /// The token stays on-chain and remains transferable (collectible resale).
    /// Updates `redeemed_at` and increments `redeem_count`.
    /// Once `redeem_count >= max_redeems`, `is_token_valid()` returns false.
    pub(crate) fn internal_redeem_token(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        check_token_in_collection(token_id, collection_id)?;

        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        let max_redeems = collection.max_redeems
            .ok_or_else(|| MarketplaceError::InvalidState("Collection is not redeemable".into()))?;

        self.check_collection_authority(actor_id, &collection)?;

        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        if token.redeem_count >= max_redeems {
            return Err(MarketplaceError::InvalidState(format!(
                "Token has reached max redemptions ({}/{})",
                token.redeem_count, max_redeems
            )));
        }

        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState("Cannot redeem a revoked token".into()));
        }

        let owner_id = token.owner_id.clone();
        token.redeemed_at = Some(env::block_timestamp());
        token.redeem_count += 1;
        let current_count = token.redeem_count;
        self.scarces_by_id.insert(token_id.to_string(), token);

        // Increment collection-level counters
        collection.redeemed_count += 1;
        if current_count >= max_redeems {
            collection.fully_redeemed_count += 1;
        }
        self.collections.insert(collection_id.to_string(), collection);

        events::emit_token_redeemed(actor_id, token_id, collection_id, &owner_id, current_count, max_redeems);
        Ok(())
    }

    /// Check that actor is the collection creator or the app owner.
    pub(crate) fn check_collection_authority(&self, actor_id: &AccountId, collection: &LazyCollection) -> Result<(), MarketplaceError> {
        if actor_id == &collection.creator_id {
            return Ok(());
        }
        if let Some(ref app_id) = collection.app_id {
            if let Some(pool) = self.app_pools.get(app_id) {
                if actor_id == &pool.owner_id {
                    return Ok(());
                }
            }
        }
        Err(MarketplaceError::Unauthorized(
            "Only collection creator or app owner can perform this action".into(),
        ))
    }

    /// Owner voluntarily burns their own native scarce token.
    /// Requires `collection.burnable == true`. Caller must be the token owner.
    pub(crate) fn internal_burn_scarce(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        check_token_in_collection(token_id, collection_id)?;

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        if !collection.burnable {
            return Err(MarketplaceError::InvalidState("Collection tokens are not burnable".into()));
        }

        let token = self
            .scarces_by_id
            .remove(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        if &token.owner_id != actor_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can burn their token".into(),
            ));
        }

        let owner_id = token.owner_id.clone();

        // Remove from owner's set
        if let Some(owner_tokens) = self.scarces_per_owner.get_mut(&owner_id) {
            owner_tokens.remove(token_id);
            if owner_tokens.is_empty() {
                self.scarces_per_owner.remove(&owner_id);
            }
        }

        // Remove from any active sale
        self.internal_remove_sale_listing(token_id, &owner_id);

        events::emit_scarce_burned(&owner_id, token_id, collection_id);
        Ok(())
    }
}
