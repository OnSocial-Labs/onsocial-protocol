use crate::external::*;
use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
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
        let sale = self
            .sales
            .get(&sale_id)
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

        let owner_id = sale.owner_id.clone();

        if let Some(tgas) = scarce_transfer_gas_tgas {
            if tgas > 300 {
                return Err(MarketplaceError::InvalidInput(
                    "scarce_transfer_gas_tgas exceeds maximum of 300".into(),
                ));
            }
        }
        if let Some(tgas) = resolve_purchase_gas_tgas {
            if tgas > 300 {
                return Err(MarketplaceError::InvalidInput(
                    "resolve_purchase_gas_tgas exceeds maximum of 300".into(),
                ));
            }
        }

        // Security boundary: remove sale before XCC; failed resolution refunds buyer.
        let before_remove = env::storage_usage();
        self.remove_sale(scarce_contract_id.clone(), token_id.clone())?;
        let bytes_freed = before_remove.saturating_sub(env::storage_usage());
        self.release_storage_waterfall(&owner_id, bytes_freed, None);

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
                Some(approval_id),
                Some("Purchased from OnSocial Marketplace".to_string()),
                U128(price),
                Some(max_payout_recipients),
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(resolve_gas))
                    .resolve_purchase(
                        buyer_id,
                        U128(price),
                        U128(deposit),
                        contract_id,
                        tok_id,
                        owner_id,
                    ),
            ))
    }

    #[private]
    pub fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        deposit: U128,
        scarce_contract_id: AccountId,
        token_id: String,
        seller_id: AccountId,
    ) -> U128 {
        // Security boundary: callback must not panic after transfer path; failures refund buyer to avoid fund loss.
        let payout_option = match env::promise_result_checked(0, 4096) {
            Ok(value) => {
                if let Ok(payout) = near_sdk::serde_json::from_slice::<Payout>(&value) {
                    if payout.payout.is_empty() {
                        env::log_str(
                            "Warning: empty payout from NFT contract, paying seller directly",
                        );
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
                events::emit_scarce_purchase_failed(
                    &buyer_id,
                    &seller_id,
                    &scarce_contract_id,
                    &token_id,
                    price,
                    "scarce_transfer_failed",
                );
                if deposit.0 > 0 {
                    let _ = Promise::new(buyer_id.clone())
                        .transfer(NearToken::from_yoctonear(deposit.0));
                }
                return U128(0);
            }
        };

        let (total_fee, _, _, _) = self.calculate_fee_split(price.0, None);
        let (revenue, app_pool_amount) = self.route_fee(price.0, None);
        let amount_after_fee = price.0.saturating_sub(total_fee);

        if let Some(payout) = payout_option {
            self.distribute_payout(&payout, amount_after_fee, &seller_id);
        } else if amount_after_fee > 0 {
            let _ = Promise::new(seller_id.clone())
                .transfer(NearToken::from_yoctonear(amount_after_fee));
        }

        events::emit_scarce_purchase(
            &buyer_id,
            &seller_id,
            &scarce_contract_id,
            &token_id,
            price,
            revenue,
            app_pool_amount,
        );

        crate::fees::refund_excess(&buyer_id, deposit.0, price.0);

        price
    }
}

impl Contract {
    pub(crate) fn purchase_native_scarce(
        &mut self,
        buyer_id: &AccountId,
        token_id: String,
        deposit: u128,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), &token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?
            .clone();

        match &sale.sale_type {
            SaleType::NativeScarce { .. } => {}
            _ => {
                self.pending_attached_balance += deposit;
                return Err(MarketplaceError::InvalidInput(
                    "This is not a native scarce listing — use offer() for externals".into(),
                ));
            }
        }

        if sale.auction.is_some() {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidInput(
                "This is an auction listing — use place_bid() to bid or wait for settlement".into(),
            ));
        }

        if let Some(expiration) = sale.expires_at {
            if env::block_timestamp() > expiration {
                self.pending_attached_balance += deposit;
                return Err(MarketplaceError::InvalidState("Sale has expired".into()));
            }
        }

        let price = sale.sale_conditions.0;

        if deposit < price {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient payment: required {}, got {}",
                price, deposit
            )));
        }
        if buyer_id == &sale.owner_id {
            self.pending_attached_balance += deposit;
            return Err(MarketplaceError::InvalidInput(
                "Cannot purchase your own listing".into(),
            ));
        }

        let seller_id = sale.owner_id.clone();

        // Security boundary: remove listing state before token transfer side effects.
        let before_remove = env::storage_usage();
        self.remove_sale(env::current_account_id(), token_id.clone())?;
        let bytes_freed = before_remove.saturating_sub(env::storage_usage());

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

        if let Some(expires_at) = token.metadata.expires_at {
            if env::block_timestamp() >= expires_at {
                return Err(MarketplaceError::InvalidState(
                    "Cannot purchase an expired token".into(),
                ));
            }
        }

        let listing_app_id = {
            let token_app_id = token.app_id.clone();
            self.resolve_token_app_id(&token_id, token_app_id.as_ref())
        };
        self.release_storage_waterfall(&seller_id, bytes_freed, listing_app_id.as_ref());

        self.transfer(
            &seller_id,
            buyer_id,
            &token_id,
            None,
            Some("Purchased on OnSocial Marketplace".to_string()),
        )?;

        let result = self.settle_secondary_sale(&token_id, price, &seller_id)?;

        // Token accounting guarantee: credit overpayment to pending_attached_balance for final settlement.
        self.pending_attached_balance += deposit.saturating_sub(price);

        events::emit_scarce_purchase(
            buyer_id,
            &seller_id,
            &env::current_account_id(),
            &token_id,
            U128(price),
            result.revenue,
            result.app_pool_amount,
        );
        Ok(())
    }
}

#[near]
impl Contract {
    #[private]
    pub fn resolve_sale_with_metadata(
        &self,
        scarce_contract_id: AccountId,
        token_id: String,
    ) -> Option<crate::external::SaleWithMetadata> {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).cloned()?;

        // Cross-contract assumption: oversized callback payload is logged and treated as missing metadata.
        let scarce_token = match env::promise_result_checked(0, MAX_METADATA_LEN) {
            Ok(value) => near_sdk::serde_json::from_slice::<Option<crate::external::Token>>(&value)
                .ok()
                .flatten(),
            Err(near_sdk::PromiseError::TooLong(len)) => {
                env::log_str(&format!("ERR_NFT_TOKEN_RESULT_TOO_LONG: {} bytes", len));
                None
            }
            Err(_) => None,
        };

        Some(crate::external::SaleWithMetadata { sale, scarce_token })
    }
}
