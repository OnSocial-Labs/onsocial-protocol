use crate::*;

impl Contract {
    pub(crate) fn purchase_from_collection(
        &mut self,
        buyer_id: &AccountId,
        collection_id: String,
        quantity: u32,
        max_price_per_token: U128,
        deposit: u128,
    ) -> Result<(), MarketplaceError> {
        if quantity == 0 || quantity > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}",
                MAX_BATCH_MINT
            )));
        }

        let collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        let now = env::block_timestamp();
        let is_before_start = collection.start_time.is_some_and(|s| now < s);

        if is_before_start {
            // State transition invariant: allowlist phase permits minting before start_time under explicit allocation checks.
            if collection.banned {
                return Err(MarketplaceError::InvalidState(
                    "Collection is banned".into(),
                ));
            }
            if collection.cancelled {
                return Err(MarketplaceError::InvalidState(
                    "Collection is cancelled".into(),
                ));
            }
            if collection.paused {
                return Err(MarketplaceError::InvalidState(
                    "Collection is paused".into(),
                ));
            }
            if collection.minted_count >= collection.total_supply {
                return Err(MarketplaceError::InvalidState("Sold out".into()));
            }
            if let Some(end) = collection.end_time {
                if now > end {
                    return Err(MarketplaceError::InvalidState(
                        "Collection has ended".into(),
                    ));
                }
            }

            let al_key = format!("{}:al:{}", collection_id, buyer_id);
            let allocation = self.collection_allowlist.get(&al_key).copied().unwrap_or(0);
            if allocation == 0 {
                return Err(MarketplaceError::Unauthorized(
                    "Collection has not started — early access requires allowlist".into(),
                ));
            }

            let mint_key = format!("{}:{}", collection_id, buyer_id);
            let already_minted = self
                .collection_mint_counts
                .get(&mint_key)
                .copied()
                .unwrap_or(0);
            if already_minted + quantity > allocation {
                return Err(MarketplaceError::InvalidInput(format!(
                    "Exceeds allowlist allocation: minted {}, requesting {}, allocation {}",
                    already_minted, quantity, allocation
                )));
            }
        } else if !self.is_collection_active(&collection) {
            return Err(MarketplaceError::InvalidState(
                "Collection is not active for minting".into(),
            ));
        }

        if collection.mint_mode == crate::MintMode::CreatorOnly {
            return Err(MarketplaceError::Unauthorized(
                "Collection is creator-only — use MintFromCollection or AirdropFromCollection"
                    .into(),
            ));
        }

        let available = collection.total_supply - collection.minted_count;
        if available < quantity {
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining",
                available
            )));
        }

        if let Some(max_per_wallet) = collection.max_per_wallet {
            let mint_key = format!("{}:{}", collection_id, buyer_id);
            let already_minted = self
                .collection_mint_counts
                .get(&mint_key)
                .copied()
                .unwrap_or(0);
            if already_minted + quantity > max_per_wallet {
                return Err(MarketplaceError::InvalidInput(format!(
                    "Exceeds per-wallet limit: minted {}, requesting {}, max {}",
                    already_minted, quantity, max_per_wallet
                )));
            }
        }

        let unit_price = if is_before_start {
            collection
                .allowlist_price
                .map(|p| p.0)
                .unwrap_or_else(|| crate::fees::compute_dutch_price(&collection))
        } else {
            crate::fees::compute_dutch_price(&collection)
        };

        if unit_price > max_price_per_token.0 {
            return Err(MarketplaceError::InvalidInput(format!(
                "Price per token ({}) exceeds maximum allowed ({})",
                unit_price, max_price_per_token.0
            )));
        }

        let total_price = unit_price
            .checked_mul(quantity as u128)
            .ok_or_else(|| MarketplaceError::InternalError("Price overflow".into()))?;
        if deposit < total_price {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}",
                total_price, deposit
            )));
        }

        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let creator_id = collection.creator_id.clone();
        let app_id = collection.app_id.clone();
        let royalty = collection.royalty.clone();

        let token_ids: Vec<String> = (start_index..start_index + quantity)
            .map(|i| format!("{}:{}", collection_id, i + 1))
            .collect();

        // State transition invariant: persist supply/revenue before mint side effects.
        let mut updated_collection = collection.clone();
        updated_collection.minted_count += quantity;
        updated_collection.total_revenue.0 += total_price;
        self.collections
            .insert(collection_id.clone(), updated_collection);

        let before = self.storage_usage_flushed();

        let ctx = crate::MintContext {
            owner_id: buyer_id.clone(),
            creator_id: creator_id.clone(),
            minter_id: buyer_id.clone(),
        };
        let ovr = crate::ScarceOverrides {
            royalty,
            paid_price: unit_price,
            ..Default::default()
        };
        let _minted = self.batch_mint(
            &ctx,
            token_ids.clone(),
            &metadata_template,
            &collection_id,
            Some(ovr),
        )?;

        // Allocation invariant: allowlist and per-wallet enforcement reads this persisted counter.
        if is_before_start || collection.max_per_wallet.is_some() {
            let mint_key = format!("{}:{}", collection_id, buyer_id);
            let prev = self
                .collection_mint_counts
                .get(&mint_key)
                .copied()
                .unwrap_or(0);
            self.collection_mint_counts
                .insert(mint_key, prev + quantity);
        }

        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // State/accounting invariant: rollback minted tokens if payment routing fails.
        let result = match self.route_primary_sale(
            total_price,
            bytes_used,
            &creator_id,
            buyer_id,
            app_id.as_ref(),
        ) {
            Ok(r) => r,
            Err(e) => {
                // Rollback: remove minted tokens
                for tid in &token_ids {
                    self.scarces_by_id.remove(tid);
                    self.remove_token_from_owner(buyer_id, tid);
                }
                // Rollback: restore collection counts
                let mut restored = self.collections.get(&collection_id).unwrap().clone();
                restored.minted_count -= quantity;
                restored.total_revenue.0 -= total_price;
                self.collections.insert(collection_id.clone(), restored);
                // Rollback: restore mint counts
                if is_before_start || collection.max_per_wallet.is_some() {
                    let mint_key = format!("{}:{}", collection_id, buyer_id);
                    let cur = self.collection_mint_counts.get(&mint_key).copied().unwrap_or(0);
                    if cur <= quantity {
                        self.collection_mint_counts.remove(&mint_key);
                    } else {
                        self.collection_mint_counts.insert(mint_key, cur - quantity);
                    }
                }
                self.pending_attached_balance += deposit;
                return Err(e);
            }
        };

        // Token accounting guarantee: credit overpayment to pending_attached_balance for final settlement.
        self.pending_attached_balance += deposit.saturating_sub(total_price);

        events::emit_collection_purchase(&events::CollectionPurchase {
            buyer_id,
            creator_id: &creator_id,
            collection_id: &collection_id,
            quantity,
            total_price: U128(total_price),
            marketplace_fee: U128(result.revenue),
            app_pool_amount: U128(result.app_pool_amount),
            app_commission: U128(result.app_commission),
            token_ids: &token_ids,
        });
        Ok(())
    }
}

impl Contract {
    pub(crate) fn mint_from_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        quantity: u32,
        receiver_id: Option<&AccountId>,
    ) -> Result<(), MarketplaceError> {
        if quantity == 0 || quantity > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}",
                MAX_BATCH_MINT
            )));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if !self.is_collection_active(&collection) {
            return Err(MarketplaceError::InvalidState(
                "Collection is not active for minting".into(),
            ));
        }

        self.check_collection_authority(actor_id, &collection)?;

        if collection.mint_mode == crate::MintMode::PurchaseOnly {
            return Err(MarketplaceError::Unauthorized(
                "Collection is purchase-only — creator cannot pre-mint".into(),
            ));
        }

        let available = collection.total_supply - collection.minted_count;
        if available < quantity {
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining",
                available
            )));
        }

        let recipient = receiver_id.unwrap_or(actor_id);
        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let royalty = collection.royalty.clone();
        let app_id = collection.app_id.clone();
        let creator_id = collection.creator_id.clone();

        let token_ids: Vec<String> = (start_index..start_index + quantity)
            .map(|i| format!("{}:{}", collection_id, i + 1))
            .collect();

        // State transition invariant: persist minted_count before mint side effects.
        let mut updated_collection = collection;
        updated_collection.minted_count += quantity;
        self.collections
            .insert(collection_id.to_string(), updated_collection);

        let before = self.storage_usage_flushed();

        let ctx = crate::MintContext {
            owner_id: recipient.clone(),
            creator_id,
            minter_id: actor_id.clone(),
        };
        let ovr = crate::ScarceOverrides {
            royalty,
            ..Default::default()
        };
        let _minted = self.batch_mint(
            &ctx,
            token_ids.clone(),
            &metadata_template,
            collection_id,
            Some(ovr),
        )?;

        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // Storage/accounting invariant: rollback minted tokens if storage charge fails.
        if let Err(e) = self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_ref()) {
            for tid in &token_ids {
                self.scarces_by_id.remove(tid);
                self.remove_token_from_owner(recipient, tid);
            }
            let mut restored = self.collections.get(collection_id).unwrap().clone();
            restored.minted_count -= quantity;
            self.collections.insert(collection_id.to_string(), restored);
            return Err(e);
        }

        events::emit_collection_mint(actor_id, recipient, collection_id, quantity, &token_ids);
        Ok(())
    }

    pub(crate) fn airdrop_from_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        receivers: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        let count = receivers.len() as u32;
        if count == 0 || count > MAX_AIRDROP_RECIPIENTS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Receivers must be 1-{}",
                MAX_AIRDROP_RECIPIENTS
            )));
        }

        let collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if !self.is_collection_active(&collection) {
            return Err(MarketplaceError::InvalidState(
                "Collection is not active for minting".into(),
            ));
        }

        self.check_collection_authority(actor_id, &collection)?;

        if collection.mint_mode == crate::MintMode::PurchaseOnly {
            return Err(MarketplaceError::Unauthorized(
                "Collection is purchase-only — creator cannot airdrop".into(),
            ));
        }

        let available = collection.total_supply - collection.minted_count;
        if available < count {
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining, need {}",
                available, count
            )));
        }

        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let royalty = collection.royalty.clone();
        let app_id = collection.app_id.clone();
        let creator_id = collection.creator_id.clone();

        // State transition invariant: persist minted_count before mint side effects.
        let mut updated_collection = collection;
        updated_collection.minted_count += count;
        self.collections
            .insert(collection_id.to_string(), updated_collection);

        let before = self.storage_usage_flushed();

        let mut token_ids = Vec::with_capacity(count as usize);

        for (i, receiver) in receivers.iter().enumerate() {
            let token_id = format!("{}:{}", collection_id, start_index + i as u32 + 1);

            let metadata = self.generate_metadata_from_template(
                &metadata_template,
                &token_id,
                i as u32,
                receiver,
                collection_id,
            )?;

            let ctx = crate::MintContext {
                owner_id: receiver.clone(),
                creator_id: creator_id.clone(),
                minter_id: actor_id.clone(),
            };
            let ovr = crate::ScarceOverrides {
                royalty: royalty.clone(),
                ..Default::default()
            };
            let minted_id = self.mint(token_id.clone(), ctx, metadata, Some(ovr))?;

            token_ids.push(minted_id);
        }

        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // Storage/accounting invariant: rollback all airdropped tokens if storage charge fails.
        if let Err(e) = self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_ref()) {
            for (i, tid) in token_ids.iter().enumerate() {
                self.scarces_by_id.remove(tid);
                self.remove_token_from_owner(&receivers[i], tid);
            }
            let mut restored = self.collections.get(collection_id).unwrap().clone();
            restored.minted_count -= count;
            self.collections.insert(collection_id.to_string(), restored);
            return Err(e);
        }

        events::emit_collection_airdrop(actor_id, collection_id, count, &token_ids, &receivers);
        Ok(())
    }
}
