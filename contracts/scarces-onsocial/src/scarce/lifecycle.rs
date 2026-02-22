use crate::*;

impl Contract {
    pub(crate) fn renew_token(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
        new_expires_at: u64,
    ) -> Result<(), MarketplaceError> {
        check_token_in_collection(token_id, collection_id)?;

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?;

        if !collection.renewable {
            return Err(MarketplaceError::InvalidState(
                "Collection is not renewable".into(),
            ));
        }

        self.check_collection_authority(actor_id, collection)?;

        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        let now = env::block_timestamp();
        if new_expires_at <= now {
            return Err(MarketplaceError::InvalidInput(
                "New expiry must be in the future".into(),
            ));
        }

        let owner_id = token.owner_id.clone();
        token.metadata.expires_at = Some(new_expires_at);
        token.metadata.updated_at = Some(now);
        self.scarces_by_id.insert(token_id.to_string(), token);

        events::emit_token_renewed(actor_id, token_id, collection_id, &owner_id, new_expires_at);
        Ok(())
    }

    pub(crate) fn revoke_token(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        collection_id: &str,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        check_token_in_collection(token_id, collection_id)?;

        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if collection.revocation_mode == RevocationMode::None {
            return Err(MarketplaceError::InvalidState(
                "Collection tokens are irrevocable".into(),
            ));
        }

        self.check_collection_authority(actor_id, &collection)?;

        match collection.revocation_mode {
            RevocationMode::Invalidate => {
                let mut token = self
                    .scarces_by_id
                    .get(token_id)
                    .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
                    .clone();

                if token.revoked_at.is_some() {
                    return Err(MarketplaceError::InvalidState(
                        "Token is already revoked".into(),
                    ));
                }

                let owner_id = token.owner_id.clone();
                token.revoked_at = Some(env::block_timestamp());
                token.revocation_memo = memo.clone();
                // Security invariant: revocation clears delegated transfer approvals.
                token.approved_account_ids.clear();
                self.scarces_by_id.insert(token_id.to_string(), token);

                self.remove_sale_listing(token_id, &owner_id, "revoked");

                events::emit_token_revoked(
                    actor_id,
                    token_id,
                    collection_id,
                    &owner_id,
                    "invalidate",
                    memo.as_deref(),
                );
            }
            RevocationMode::Burn => {
                let token = self
                    .scarces_by_id
                    .remove(token_id)
                    .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
                let owner_id = token.owner_id.clone();

                self.remove_token_from_owner(&owner_id, token_id);
                self.remove_sale_listing(token_id, &owner_id, "burned");

                collection.minted_count = collection.minted_count.saturating_sub(1);
                self.collections.insert(collection_id.to_string(), collection);

                events::emit_token_revoked(
                    actor_id,
                    token_id,
                    collection_id,
                    &owner_id,
                    "burn",
                    memo.as_deref(),
                );
            }
            RevocationMode::None => unreachable!(),
        }
        Ok(())
    }

    pub(crate) fn remove_sale_listing(
        &mut self,
        token_id: &str,
        owner_id: &AccountId,
        reason: &str,
    ) {
        let contract_id = env::current_account_id();
        if let Ok(sale) = self.remove_sale(contract_id, token_id.to_string()) {
            if let Some(ref auction) = sale.auction {
                if auction.highest_bid > 0 {
                    if let Some(ref bidder) = auction.highest_bidder {
                        let _ = Promise::new(bidder.clone())
                            .transfer(NearToken::from_yoctonear(auction.highest_bid));
                    }
                }
            }
            events::emit_auto_delisted(token_id, owner_id, reason);
        }
    }

    pub(crate) fn redeem_token(
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

        let max_redeems = collection
            .max_redeems
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
            return Err(MarketplaceError::InvalidState(
                "Cannot redeem a revoked token".into(),
            ));
        }

        let owner_id = token.owner_id.clone();
        token.redeemed_at = Some(env::block_timestamp());
        token.redeem_count += 1;
        let current_count = token.redeem_count;
        self.scarces_by_id.insert(token_id.to_string(), token);

        collection.redeemed_count += 1;
        if current_count >= max_redeems {
            collection.fully_redeemed_count += 1;
        }
        self.collections
            .insert(collection_id.to_string(), collection);

        events::emit_token_redeemed(
            actor_id,
            token_id,
            collection_id,
            &owner_id,
            current_count,
            max_redeems,
        );
        Ok(())
    }

    // Security boundary: only collection creator has lifecycle authority in this path.
    pub(crate) fn check_collection_authority(
        &self,
        actor_id: &AccountId,
        collection: &LazyCollection,
    ) -> Result<(), MarketplaceError> {
        if actor_id == &collection.creator_id {
            return Ok(());
        }
        Err(MarketplaceError::Unauthorized(
            "Only the collection creator can perform this action".into(),
        ))
    }

    pub(crate) fn burn_scarce(
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

        if !collection.burnable {
            return Err(MarketplaceError::InvalidState(
                "Collection tokens are not burnable".into(),
            ));
        }

        let owner_id = {
            let token = self
                .scarces_by_id
                .get(token_id)
                .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
            if &token.owner_id != actor_id {
                return Err(MarketplaceError::Unauthorized(
                    "Only the token owner can burn their token".into(),
                ));
            }
            token.owner_id.clone()
        };

        self.scarces_by_id.remove(token_id);

        self.remove_token_from_owner(&owner_id, token_id);
        self.remove_sale_listing(token_id, &owner_id, "burned");

        collection.minted_count = collection.minted_count.saturating_sub(1);
        self.collections.insert(collection_id.to_string(), collection);

        events::emit_scarce_burned(&owner_id, token_id, Some(collection_id));
        Ok(())
    }

    pub(crate) fn burn_standalone(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let owner_id = {
            let token = self
                .scarces_by_id
                .get(token_id)
                .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
            // State compatibility invariant: absent burnable flag is treated as burnable.
            if token.burnable == Some(false) {
                return Err(MarketplaceError::InvalidState(
                    "Token is not burnable".into(),
                ));
            }
            if &token.owner_id != actor_id {
                return Err(MarketplaceError::Unauthorized(
                    "Only the token owner can burn their token".into(),
                ));
            }
            token.owner_id.clone()
        };

        self.scarces_by_id.remove(token_id);

        self.remove_token_from_owner(&owner_id, token_id);
        self.remove_sale_listing(token_id, &owner_id, "burned");

        events::emit_scarce_burned(&owner_id, token_id, None);
        Ok(())
    }
}
