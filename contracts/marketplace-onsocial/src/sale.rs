//! Sale listing and purchase functions with 3-tier storage.

use crate::external::*;
use crate::internal::*;
use crate::*;
use near_sdk::json_types::U128;


#[near]
impl Contract {
    /// List a Scarce for sale (requires cross-contract approval verification).
    #[payable]
    #[handle_result]
    pub fn list_scarce_for_sale(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        approval_gas_tgas: Option<u64>,
    ) -> Result<Promise, MarketplaceError> {
        check_at_least_one_yocto()?;
        if token_id.len() > MAX_TOKEN_ID_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Token ID too long (max {} characters)",
                MAX_TOKEN_ID_LEN
            )));
        }

        let owner_id = env::predecessor_account_id();

        // Storage is measured after listing is confirmed in process_listing callback

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        if self.sales.get(&sale_id).is_some() {
            return Err(MarketplaceError::InvalidState(
                "Sale already exists for this scarce".into(),
            ));
        }

        if let Some(expiration) = expires_at {
            let now = env::block_timestamp();
            if expiration <= now {
                return Err(MarketplaceError::InvalidInput(
                    "Expiration must be in the future".into(),
                ));
            }
        }

        let approval_gas = Gas::from_tgas(approval_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));

        Ok(ext_scarce_contract::ext(scarce_contract_id.clone())
            .with_static_gas(approval_gas)
            .nft_is_approved(
                token_id.clone(),
                env::current_account_id(),
                Some(approval_id),
            )
            .and(
                ext_scarce_contract::ext(scarce_contract_id.clone())
                    .with_static_gas(approval_gas)
                    .nft_token_owner(token_id.clone()),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(approval_gas)
                    .process_listing(
                        scarce_contract_id,
                        token_id,
                        approval_id,
                        sale_conditions,
                        expires_at,
                        owner_id,
                    ),
            ))
    }

    /// Callback to process listing after verification.
    /// SAFETY: This is a callback — must NEVER panic. Failures are logged and returned gracefully.
    #[private]
    pub fn process_listing(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        owner_id: AccountId,
    ) {
        if env::promise_results_count() != 2 {
            env::log_str("Listing failed: expected 2 promise results");
            return;
        }

        let is_approved = match env::promise_result_checked(0, 16) {
            Ok(value) => near_sdk::serde_json::from_slice::<bool>(&value).unwrap_or(false),
            Err(_) => {
                env::log_str("Listing failed: approval check call failed");
                return;
            }
        };
        if !is_approved {
            env::log_str("Listing failed: marketplace is not approved for this token");
            return;
        }

        let token_owner = match env::promise_result_checked(1, 128) {
            Ok(value) => match near_sdk::serde_json::from_slice::<AccountId>(&value) {
                Ok(owner) => owner,
                Err(_) => {
                    env::log_str("Listing failed: could not parse token owner");
                    return;
                }
            },
            Err(_) => {
                env::log_str("Listing failed: owner check call failed");
                return;
            }
        };
        if token_owner != owner_id {
            env::log_str("Listing failed: caller is not the token owner");
            return;
        }

        let sale = Sale {
            owner_id: owner_id.clone(),
            sale_conditions,
            sale_type: SaleType::External {
                scarce_contract_id: scarce_contract_id.clone(),
                token_id: token_id.clone(),
                approval_id,
            },
            expires_at,
            auction: None,
        };

        let before = env::storage_usage();
        self.internal_add_sale(sale);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Charge storage via Tier 2/3 waterfall (no app_id for external listings)
        if let Err(e) = self.charge_storage_waterfall(&owner_id, bytes_used as u64, None) {
            env::log_str(&format!("Listing storage charge failed: {}", e));
            return;
        }

        events::emit_scarce_list(
            &owner_id,
            &scarce_contract_id,
            vec![token_id],
            vec![sale_conditions],
        );
    }

    /// Remove a scarce from sale.
    #[payable]
    #[handle_result]
    pub fn remove_sale(&mut self, scarce_contract_id: AccountId, token_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        if env::predecessor_account_id() != sale.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the owner can remove the sale".into(),
            ));
        }

        let owner_id = sale.owner_id.clone();
        self.internal_remove_sale(scarce_contract_id.clone(), token_id.clone())?;

        events::emit_scarce_delist(&owner_id, &scarce_contract_id, vec![token_id]);
        Ok(())
    }

    /// Update the price of a listing.
    #[payable]
    #[handle_result]
    pub fn update_price(&mut self, scarce_contract_id: AccountId, token_id: String, price: U128) -> Result<(), MarketplaceError> {
        check_one_yocto()?;

        let caller = env::predecessor_account_id();
        self.internal_update_price(&caller, &scarce_contract_id, &token_id, price)
    }

    /// Purchase an external Scarce.
    #[payable]
    #[handle_result]
    pub fn offer(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        max_len_payout: Option<u32>,
        scarce_transfer_gas_tgas: Option<u64>,
        resolve_purchase_gas_tgas: Option<u64>,
    ) -> Result<Promise, MarketplaceError> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        if let Some(expiration) = sale.expires_at {
            if env::block_timestamp() > expiration {
                return Err(MarketplaceError::InvalidState("Sale has expired".into()));
            }
        }

        let (contract_id, tok_id, approval_id) = match &sale.sale_type {
            SaleType::External {
                scarce_contract_id,
                token_id,
                approval_id,
            } => (scarce_contract_id.clone(), token_id.clone(), *approval_id),
            SaleType::LazyCollection { .. } => {
                return Err(MarketplaceError::InvalidInput(
                    "Use purchase_from_collection() for lazy-minted scarces".into(),
                ));
            }
            SaleType::NativeScarce { .. } => {
                return Err(MarketplaceError::InvalidInput(
                    "Use purchase_native_scarce() for native scarce listings".into(),
                ));
            }
        };

        let buyer_id = env::predecessor_account_id();
        if buyer_id == sale.owner_id {
            return Err(MarketplaceError::InvalidInput(
                "Cannot purchase your own listing".into(),
            ));
        }
        let price = sale.sale_conditions.0;
        let deposit = env::attached_deposit().as_yoctonear();

        if deposit < price {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Attached deposit {} is less than price {}",
                deposit, price
            )));
        }

        let max_payout_recipients = max_len_payout.unwrap_or(10).min(20);
        let transfer_gas = scarce_transfer_gas_tgas.unwrap_or(DEFAULT_SCARCE_TRANSFER_GAS);
        let default_resolve_gas = if max_payout_recipients <= 10 {
            DEFAULT_RESOLVE_PURCHASE_GAS
        } else {
            MAX_RESOLVE_PURCHASE_GAS
        };
        let resolve_gas = resolve_purchase_gas_tgas.unwrap_or(default_resolve_gas);

        Ok(ext_scarce_contract::ext(contract_id.clone())
            .with_static_gas(Gas::from_tgas(transfer_gas))
            .with_attached_deposit(ONE_YOCTO)
            .nft_transfer_payout(
                buyer_id.clone(),
                tok_id.clone(),
                approval_id,
                Some("Purchased from OnSocial Marketplace".to_string()),
                U128(price),
                max_payout_recipients,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(resolve_gas))
                    .resolve_purchase(buyer_id, U128(price), contract_id, tok_id),
            ))
    }

    /// Resolve purchase: distribute payments with fee split.
    /// SAFETY: This is a callback — must NEVER panic. The NFT transfer on the external
    /// contract has already completed and is irreversible. If we panic here, the buyer
    /// gets the NFT for free because payment distribution is rolled back.
    #[private]
    pub fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> U128 {
        let payout_option = match env::promise_result_checked(0, 4096) {
            Ok(value) => {
                if let Ok(payout) = near_sdk::serde_json::from_slice::<Payout>(&value) {
                    // Validate payout gracefully — never panic after irreversible transfer
                    if payout.payout.is_empty() {
                        env::log_str("Warning: empty payout from NFT contract, paying seller directly");
                        None
                    } else {
                        let total_payout: u128 = payout.payout.values().map(|a| a.0).sum();
                        if total_payout > price.0 {
                            env::log_str("Warning: payout exceeds price, paying seller directly");
                            None
                        } else {
                            Some(payout)
                        }
                    }
                } else {
                    env::log_str("Warning: could not parse payout, paying seller directly");
                    None
                }
            }
            Err(_) => {
                // Transfer failed → refund buyer
                let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
                if let Some(sale) = self.sales.get(&sale_id) {
                    events::emit_scarce_purchase_failed(
                        &buyer_id,
                        &sale.owner_id,
                        &scarce_contract_id,
                        &token_id,
                        price,
                        "scarce_transfer_failed",
                    );
                }
                if price.0 > 0 {
                    let _ = Promise::new(buyer_id.clone()).transfer(NearToken::from_yoctonear(price.0));
                }
                return U128(0);
            }
        };

        let sale = match self.internal_remove_sale(scarce_contract_id.clone(), token_id.clone()) {
            Ok(sale) => sale,
            Err(e) => {
                env::log_str(&format!("Warning: failed to remove sale: {e}"));
                if price.0 > 0 {
                    let _ = Promise::new(buyer_id.clone())
                        .transfer(NearToken::from_yoctonear(price.0));
                }
                return U128(0);
            }
        };

        // Route fee: revenue to platform (no app_id for external scarce sales)
        let (revenue, app_pool_amount) = self.route_fee(price.0, None);
        let total_fee = revenue + app_pool_amount;
        let amount_after_fee = price.0.saturating_sub(total_fee);

        if let Some(payout) = payout_option {
            self.distribute_payout(&payout, amount_after_fee, &sale.owner_id);
        } else {
            // No payout → pay seller directly
            if amount_after_fee > 0 {
                let _ = Promise::new(sale.owner_id.clone())
                    .transfer(NearToken::from_yoctonear(amount_after_fee));
            }
        }

        events::emit_scarce_purchase(
            &buyer_id,
            &sale.owner_id,
            &scarce_contract_id,
            &token_id,
            price,
            revenue,
            app_pool_amount,
        );

        price
    }
}

// ── Native scarce listing + purchase ─────────────────────────────────────────

#[near]
impl Contract {
    /// Purchase a listed native scarce (marketplace-minted token).
    /// The marketplace handles the transfer internally — no cross-contract call needed.
    #[payable]
    #[handle_result]
    pub fn purchase_native_scarce(
        &mut self,
        token_id: String,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), &token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?.clone();

        // Verify this is actually a native scarce listing
        match &sale.sale_type {
            SaleType::NativeScarce { .. } => {}
            _ => return Err(MarketplaceError::InvalidInput(
                "This is not a native scarce listing — use offer() for externals".into(),
            )),
        }

        if let Some(expiration) = sale.expires_at {
            if env::block_timestamp() > expiration {
                return Err(MarketplaceError::InvalidState("Sale has expired".into()));
            }
        }

        let buyer_id = env::predecessor_account_id();
        let price = sale.sale_conditions.0;
        let deposit = env::attached_deposit().as_yoctonear();

        if deposit < price {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}", price, deposit
            )));
        }
        if buyer_id == sale.owner_id {
            return Err(MarketplaceError::InvalidInput(
                "Cannot purchase your own listing".into(),
            ));
        }

        let seller_id = sale.owner_id.clone();

        // Remove sale listing first (reentrancy protection)
        self.internal_remove_sale(env::current_account_id(), token_id.clone())?;

        // Verify token still exists and is valid
        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token no longer exists".into()))?;

        if token.owner_id != seller_id {
            return Err(MarketplaceError::InvalidState(
                "Token ownership changed — sale is stale".into(),
            ));
        }
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(
                "Cannot purchase a revoked token".into(),
            ));
        }

        // Check if token has expired
        if let Some(expires_at) = token.metadata.expires_at {
            if env::block_timestamp() >= expires_at {
                return Err(MarketplaceError::InvalidState(
                    "Cannot purchase an expired token".into(),
                ));
            }
        }

        // Transfer the native scarce to buyer
        self.internal_transfer(&seller_id, &buyer_id, &token_id, None, Some("Purchased on OnSocial Marketplace".to_string()))?;

        // Compute royalty payout via NEP-199
        let token = self.scarces_by_id.get(&token_id)
            .ok_or_else(|| MarketplaceError::InternalError("Token not found after transfer".into()))?;
        let payout = self.internal_compute_payout(token, price, 10)?;

        // Route marketplace fee (use collection's app_id if available)
        let cid = collection_id_from_token_id(&token_id);
        let app_id = self.collections.get(cid).and_then(|c| c.app_id.clone());
        let (revenue, app_pool_amount) = self.route_fee(price, app_id.as_ref());
        let total_fee = revenue + app_pool_amount;
        let amount_after_fee = price.saturating_sub(total_fee);

        // Distribute according to royalty payout
        self.distribute_payout(&payout, amount_after_fee, &seller_id);

        // Refund excess
        let refund = deposit - price;
        if refund > 0 {
            let _ = Promise::new(buyer_id.clone())
                .transfer(NearToken::from_yoctonear(refund));
        }

        events::emit_scarce_purchase(
            &buyer_id,
            &seller_id,
            &env::current_account_id(),
            &token_id,
            U128(price),
            revenue,
            app_pool_amount,
        );
        Ok(())
    }
}

// ── Internal native listing helpers ──────────────────────────────────────────

impl Contract {
    /// List a native scarce for sale.
    /// Caller must be the token owner. No cross-contract approval needed.
    pub(crate) fn internal_list_native_scarce(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
        price: U128,
        expires_at: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can list it for sale".into(),
            ));
        }
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(
                "Cannot list a revoked token for sale".into(),
            ));
        }

        // Block listing of soulbound (non-transferable) tokens
        let cid = collection_id_from_token_id(token_id);
        if !cid.is_empty() {
            if let Some(collection) = self.collections.get(cid) {
                if !collection.transferable {
                    return Err(MarketplaceError::InvalidState(
                        "Cannot list a non-transferable (soulbound) token for sale".into(),
                    ));
                }
            }
        }

        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        if self.sales.contains_key(&sale_id) {
            return Err(MarketplaceError::InvalidState(
                "Token is already listed for sale".into(),
            ));
        }

        if let Some(expiration) = expires_at {
            if expiration <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "Expiration must be in the future".into(),
                ));
            }
        }

        let sale = Sale {
            owner_id: owner_id.clone(),
            sale_conditions: price,
            sale_type: SaleType::NativeScarce {
                token_id: token_id.to_string(),
            },
            expires_at,
            auction: None,
        };

        let before = env::storage_usage();
        self.internal_add_sale(sale);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Charge storage via waterfall (use collection's app_id if available)
        let cid = collection_id_from_token_id(token_id);
        let app_id = self.collections.get(cid).and_then(|c| c.app_id.clone());
        self.charge_storage_waterfall(owner_id, bytes_used as u64, app_id.as_ref())?;

        events::emit_native_scarce_listed(owner_id, token_id, price);
        Ok(())
    }

    /// Delist a native scarce from sale. Caller must be the owner.
    pub(crate) fn internal_delist_native_scarce(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found for this token".into()))?;

        if &sale.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized("Only the owner can delist".into()));
        }

        self.internal_remove_sale(env::current_account_id(), token_id.to_string())?;

        events::emit_native_scarce_delisted(owner_id, token_id);
        Ok(())
    }

}

// ── Sale-listing helpers (moved from lib.rs) ─────────────────────────────────

impl Contract {
    /// Delist a scarce (used by execute dispatch and remove_sale)
    pub(crate) fn internal_delist_scarce(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        if actor_id != &sale.owner_id {
            return Err(MarketplaceError::Unauthorized("Only owner can delist".into()));
        }
        let owner_id = sale.owner_id.clone();
        self.internal_remove_sale(scarce_contract_id.clone(), token_id.to_string())?;
        events::emit_scarce_delist(&owner_id, scarce_contract_id, vec![token_id.to_string()]);
        Ok(())
    }

    /// Update listing price (used by execute dispatch and update_price)
    pub(crate) fn internal_update_price(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
        price: U128,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self.sales.get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        if actor_id != &sale.owner_id {
            return Err(MarketplaceError::Unauthorized("Only owner can update price".into()));
        }
        if price.0 == 0 {
            return Err(MarketplaceError::InvalidInput("Price must be greater than 0".into()));
        }
        let old_price = sale.sale_conditions;
        let mut sale = sale.clone();
        sale.sale_conditions = price;
        self.sales.insert(sale_id, sale.clone());
        events::emit_scarce_update_price(
            &sale.owner_id, scarce_contract_id, token_id, old_price, price,
        );
        Ok(())
    }
}
