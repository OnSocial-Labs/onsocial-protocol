//! Collection purchase — mint scarces from lazy collections with Tier 1 storage.

use crate::*;

/// Compute the current Dutch auction price for a collection.
/// If `start_price` is set above `price_near`, price decreases linearly
/// from `start_price` → `price_near` over `start_time` → `end_time`.
/// Returns `price_near` if not a Dutch auction or the window has ended.
pub(crate) fn compute_dutch_price(collection: &LazyCollection) -> u128 {
    let floor = collection.price_near.0;
    let start_price = match collection.start_price {
        Some(sp) if sp.0 > floor => sp.0,
        _ => return floor, // not a Dutch auction
    };
    let start = match collection.start_time {
        Some(t) => t,
        None => return floor,
    };
    let end = match collection.end_time {
        Some(t) => t,
        None => return floor,
    };
    let now = env::block_timestamp();
    if now <= start {
        return start_price;
    }
    if now >= end {
        return floor;
    }
    // Linear interpolation: start_price - (start_price - floor) * elapsed / duration
    let elapsed = (now - start) as u128;
    let duration = (end - start) as u128;
    let diff = start_price - floor;
    start_price - (diff * elapsed / duration)
}

#[near]
impl Contract {
    /// Purchase and mint scarces from a lazy collection.
    /// Atomic: update count → pay → mint → refund.
    #[payable]
    #[handle_result]
    pub fn purchase_from_collection(
        &mut self,
        collection_id: String,
        quantity: u32,
        max_price_per_token: Option<U128>,
    ) -> Result<(), MarketplaceError> {
        if quantity == 0 || quantity > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}", MAX_BATCH_MINT
            )));
        }

        let collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        // ── Phase detection: allowlist vs public ──
        let now = env::block_timestamp();
        let is_before_start = collection.start_time.is_some_and(|s| now < s);
        let buyer_id = env::predecessor_account_id();

        if is_before_start {
            // Allowlist early-access phase — base checks (skip start_time)
            if collection.cancelled {
                return Err(MarketplaceError::InvalidState("Collection is cancelled".into()));
            }
            if collection.paused {
                return Err(MarketplaceError::InvalidState("Collection is paused".into()));
            }
            if collection.minted_count >= collection.total_supply {
                return Err(MarketplaceError::InvalidState("Sold out".into()));
            }
            if let Some(end) = collection.end_time {
                if now > end {
                    return Err(MarketplaceError::InvalidState("Collection has ended".into()));
                }
            }

            // Must be on allowlist
            let al_key = format!("{}:al:{}", collection_id, buyer_id);
            let allocation = self.collection_allowlist.get(&al_key).copied().unwrap_or(0);
            if allocation == 0 {
                return Err(MarketplaceError::Unauthorized(
                    "Collection has not started — early access requires allowlist".into(),
                ));
            }

            // Enforce allowlist allocation
            let mint_key = format!("{}:{}", collection_id, buyer_id);
            let already_minted = self.collection_mint_counts.get(&mint_key).copied().unwrap_or(0);
            if already_minted + quantity > allocation {
                return Err(MarketplaceError::InvalidInput(format!(
                    "Exceeds allowlist allocation: minted {}, requesting {}, allocation {}",
                    already_minted, quantity, allocation
                )));
            }
        } else {
            // Public phase
            if !self.is_collection_active(&collection) {
                return Err(MarketplaceError::InvalidState(
                    "Collection is not active for minting".into(),
                ));
            }
        }

        if collection.mint_mode == crate::MintMode::CreatorOnly {
            return Err(MarketplaceError::Unauthorized(
                "Collection is creator-only — use MintFromCollection or AirdropFromCollection".into(),
            ));
        }

        let available = collection.total_supply - collection.minted_count;
        if available < quantity {
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining", available
            )));
        }

        // Per-wallet mint limit check (applies in both phases)
        if !is_before_start {
            if let Some(max_per_wallet) = collection.max_per_wallet {
                let mint_key = format!("{}:{}", collection_id, buyer_id);
                let already_minted = self.collection_mint_counts.get(&mint_key).copied().unwrap_or(0);
                if already_minted + quantity > max_per_wallet {
                    return Err(MarketplaceError::InvalidInput(format!(
                        "Exceeds per-wallet limit: minted {}, requesting {}, max {}",
                        already_minted, quantity, max_per_wallet
                    )));
                }
            }
        }

        // ── Price: allowlist_price during WL phase, otherwise Dutch/fixed ──
        let unit_price = if is_before_start {
            collection.allowlist_price.map(|p| p.0).unwrap_or_else(|| compute_dutch_price(&collection))
        } else {
            compute_dutch_price(&collection)
        };

        if let Some(max_price) = max_price_per_token {
            if unit_price > max_price.0 {
                return Err(MarketplaceError::InvalidInput(format!(
                    "Price per token ({}) exceeds maximum allowed ({})",
                    unit_price, max_price.0
                )));
            }
        }

        let total_price = unit_price * quantity as u128;
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit < total_price {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}", total_price, deposit
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

        // Update count FIRST (reentrancy protection)
        let mut updated_collection = collection.clone();
        updated_collection.minted_count += quantity;
        self.collections
            .insert(collection_id.clone(), updated_collection);

        // Measure storage BEFORE minting
        let before = env::storage_usage();

        // Mint tokens (with royalty from collection)
        let _minted = self.internal_batch_mint(
            &buyer_id,
            token_ids.clone(),
            &metadata_template,
            &collection_id,
            royalty.as_ref(),
        )?;

        // Set paid_price on each minted token
        let price_per_token = collection.price_near.0;
        for tid in &token_ids {
            if let Some(mut scarce) = self.scarces_by_id.remove(tid) {
                scarce.paid_price = price_per_token;
                self.scarces_by_id.insert(tid.clone(), scarce);
            }
        }

        // Measure storage AFTER minting
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        let (revenue, app_pool_amount) = if total_price > 0 {
            // ── Paid mint: Tier 1 (storage from price) ───────────────
            let storage_cost = self.charge_storage_from_price(bytes_used as u64);
            let (rev, app_amt) = self.route_fee(total_price, app_id.as_ref());

            // Primary sale commission to app owner
            let app_commission = self.calculate_app_commission(total_price, app_id.as_ref());
            if app_commission > 0 {
                if let Some(ref aid) = app_id {
                    if let Some(pool) = self.app_pools.get(aid) {
                        let _ = Promise::new(pool.owner_id.clone())
                            .transfer(NearToken::from_yoctonear(app_commission));
                    }
                }
            }

            let total_deductions = rev + app_amt + storage_cost + app_commission;
            let creator_payment = total_price.saturating_sub(total_deductions);

            if creator_payment > 0 {
                let _ = Promise::new(creator_id.clone()).transfer(NearToken::from_yoctonear(creator_payment));
            }
            (rev, app_amt)
        } else {
            // ── Free mint: Tier 2 (app pool) → Tier 3 (user balance) ─
            self.charge_storage_waterfall(&buyer_id, bytes_used as u64, app_id.as_ref())?;
            (0u128, 0u128)
        };

        // Refund excess
        let refund = deposit - total_price;
        if refund > 0 {
            let _ = Promise::new(buyer_id.clone()).transfer(NearToken::from_yoctonear(refund));
        }

        // Update per-wallet mint count
        if collection.max_per_wallet.is_some() {
            let mint_key = format!("{}:{}", collection_id, buyer_id);
            let prev = self.collection_mint_counts.get(&mint_key).copied().unwrap_or(0);
            self.collection_mint_counts.insert(mint_key, prev + quantity);
        }

        events::emit_collection_purchase(
            &buyer_id,
            &creator_id,
            &collection_id,
            quantity,
            U128(total_price),
            U128(revenue),
            U128(app_pool_amount),
        );
        Ok(())
    }
}

// ── Creator / App-owner pre-mint ─────────────────────────────────────────────

impl Contract {
    /// Mint from own collection to self or a specified recipient.
    /// No payment — storage charged via app-pool → user-balance waterfall.
    /// Only the collection creator or app owner may call this.
    pub(crate) fn internal_mint_from_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        quantity: u32,
        receiver_id: Option<&AccountId>,
    ) -> Result<(), MarketplaceError> {
        if quantity == 0 || quantity > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}", MAX_BATCH_MINT
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

        // Only creator or app owner
        self.check_collection_authority(actor_id, &collection)?;

        if collection.mint_mode == crate::MintMode::PurchaseOnly {
            return Err(MarketplaceError::Unauthorized(
                "Collection is purchase-only — creator cannot pre-mint".into(),
            ));
        }

        let available = collection.total_supply - collection.minted_count;
        if available < quantity {
            return Err(MarketplaceError::InvalidState(format!(
                "Only {} items remaining", available
            )));
        }

        let recipient = receiver_id.unwrap_or(actor_id);
        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let royalty = collection.royalty.clone();
        let app_id = collection.app_id.clone();

        let token_ids: Vec<String> = (start_index..start_index + quantity)
            .map(|i| format!("{}:{}", collection_id, i + 1))
            .collect();

        // Update count FIRST (reentrancy protection)
        let mut updated_collection = collection;
        updated_collection.minted_count += quantity;
        self.collections
            .insert(collection_id.to_string(), updated_collection);

        // Measure storage BEFORE minting
        let before = env::storage_usage();

        // Mint tokens to recipient
        let _minted = self.internal_batch_mint(
            recipient,
            token_ids.clone(),
            &metadata_template,
            collection_id,
            royalty.as_ref(),
        )?;

        // Measure storage AFTER minting
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Storage charged via waterfall (no payment)
        self.charge_storage_waterfall(actor_id, bytes_used as u64, app_id.as_ref())?;

        events::emit_collection_mint(
            actor_id,
            recipient,
            collection_id,
            quantity,
            &token_ids,
        );
        Ok(())
    }



    pub(crate) fn internal_airdrop_from_collection(
        &mut self,
        actor_id: &AccountId,
        collection_id: &str,
        receivers: Vec<AccountId>,
    ) -> Result<(), MarketplaceError> {
        let count = receivers.len() as u32;
        if count == 0 || count > MAX_AIRDROP_RECIPIENTS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Receivers must be 1-{}", MAX_AIRDROP_RECIPIENTS
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
                "Only {} items remaining, need {}", available, count
            )));
        }

        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let royalty = collection.royalty.clone();
        let app_id = collection.app_id.clone();

        // Update count FIRST (reentrancy protection)
        let mut updated_collection = collection;
        updated_collection.minted_count += count;
        self.collections
            .insert(collection_id.to_string(), updated_collection);

        // Measure storage BEFORE minting
        let before = env::storage_usage();

        let mut token_ids = Vec::with_capacity(count as usize);

        // Mint one token per receiver
        for (i, receiver) in receivers.iter().enumerate() {
            let token_id = format!("{}:{}", collection_id, start_index + i as u32 + 1);

            let metadata = self.generate_metadata_from_template(
                &metadata_template,
                &token_id,
                i as u32,
                receiver,
                collection_id,
            )?;

            let minted_id = self.internal_mint(token_id.clone(), receiver.clone(), metadata)?;

            // Set royalty on minted token
            if let Some(ref r) = royalty {
                if let Some(mut scarce) = self.scarces_by_id.remove(&minted_id) {
                    scarce.royalty = Some(r.clone());
                    self.scarces_by_id.insert(minted_id.clone(), scarce);
                }
            }

            token_ids.push(minted_id);
        }

        // Measure storage AFTER minting
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Storage charged via waterfall (creator/app pays)
        self.charge_storage_waterfall(actor_id, bytes_used as u64, app_id.as_ref())?;

        events::emit_collection_airdrop(
            actor_id,
            collection_id,
            count,
            &token_ids,
            &receivers,
        );
        Ok(())
    }
}
