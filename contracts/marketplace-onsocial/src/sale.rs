// Sale listing and management functions

use crate::*;
use crate::external::*;
use crate::internal::*;
use near_sdk::json_types::U128;
use near_sdk::PromiseResult;

#[near]
impl Contract {
    /// List an NFT for sale (optional gas override for approval verification)
    #[payable]
    pub fn list_nft_for_sale(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>, // Optional expiration timestamp
        approval_gas_tgas: Option<u64>,
    ) -> Promise {
        assert_at_least_one_yocto();
        assert!(token_id.len() <= MAX_TOKEN_ID_LEN, "Token ID too long (max {} characters)", MAX_TOKEN_ID_LEN);
        
        let owner_id = env::predecessor_account_id();
        self.assert_storage_available(&owner_id);
        
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        assert!(self.sales.get(&sale_id).is_none(), "Sale already exists for this NFT");
        
        // Validate expiration if provided
        if let Some(expiration) = expires_at {
            let now = env::block_timestamp();
            assert!(
                expiration > now,
                "Expiration must be in the future (now: {}, expiration: {})",
                now, expiration
            );
        }
        
        // Use provided gas or sensible default
        let approval_gas = Gas::from_tgas(approval_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
        
        ext_nft_contract::ext(nft_contract_id.clone())
            .with_static_gas(approval_gas)
            .nft_is_approved(token_id.clone(), env::current_account_id(), Some(approval_id))
        .and(
            ext_nft_contract::ext(nft_contract_id.clone())
                .with_static_gas(approval_gas)
                .nft_token_owner(token_id.clone())
        )
        .then(
            ext_self::ext(env::current_account_id())
                .with_static_gas(approval_gas)
                .process_listing(nft_contract_id, token_id, approval_id, sale_conditions, expires_at, owner_id)
        )
    }
    
    /// Callback to process listing after verification
    #[private]
    pub fn process_listing(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        owner_id: AccountId,
    ) {
        // Check both promise results
        assert_eq!(env::promise_results_count(), 2, "Expected 2 promise results");
        
        // Check if marketplace is approved
        let is_approved = match env::promise_result(0) {
            PromiseResult::Successful(value) => {
                near_sdk::serde_json::from_slice::<bool>(&value)
                    .expect("Failed to parse approval result")
            }
            _ => panic!("Approval check failed"),
        };
        
        assert!(is_approved, "Marketplace is not approved for this token");
        
        // Check if caller is the owner
        let token_owner = match env::promise_result(1) {
            PromiseResult::Successful(value) => {
                near_sdk::serde_json::from_slice::<AccountId>(&value)
                    .expect("Failed to parse owner result")
            }
            _ => panic!("Owner check failed"),
        };
        
        assert_eq!(
            token_owner, owner_id,
            "Only the token owner can list it for sale"
        );
        
        // Create and store the sale
        let sale = Sale {
            owner_id: owner_id.clone(),
            sale_conditions,
            sale_type: SaleType::External {
                nft_contract_id: nft_contract_id.clone(),
                token_id: token_id.clone(),
                approval_id,
            },
            expires_at,
        };
        
        self.internal_add_sale(sale);
        
        // Emit OnSocial event
        crate::events::emit_nft_list_event(
            &owner_id,
            &nft_contract_id,
            vec![token_id.clone()],
            vec![sale_conditions],
        );
        
        env::log_str(&format!(
            "NFT listed: {} listed {}.{} for {} yoctoNEAR",
            owner_id,
            nft_contract_id,
            token_id,
            sale_conditions.0
        ));
    }
    
    /// Remove an NFT from sale
    #[payable]
    pub fn remove_sale(&mut self, nft_contract_id: AccountId, token_id: String) {
        assert_one_yocto();
        
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");
        
        // Only owner can remove
        assert_eq!(
            env::predecessor_account_id(),
            sale.owner_id,
            "Only the owner can remove the sale"
        );
        
        let owner_id = sale.owner_id.clone();
        
        self.internal_remove_sale(nft_contract_id.clone(), token_id.clone());
        
        // Emit OnSocial event
        crate::events::emit_nft_delist_event(
            &owner_id,
            &nft_contract_id,
            vec![token_id.clone()],
        );
        
        env::log_str(&format!(
            "Sale removed: {}.{} delisted",
            nft_contract_id, token_id
        ));
    }
    
    /// Update the price of an NFT listing
    #[payable]
    pub fn update_price(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
        price: U128,
    ) {
        assert_one_yocto();
        
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");
        
        // Only owner can update
        assert_eq!(
            env::predecessor_account_id(),
            sale.owner_id,
            "Only the owner can update the price"
        );
        
        assert!(price.0 > 0, "Price must be greater than 0");
        
        let old_price = sale.sale_conditions;
        
        // Update price
        let mut sale = sale.clone();
        sale.sale_conditions = price;
        self.sales.insert(sale_id, sale.clone());
        
        // Emit OnSocial event
        crate::events::emit_nft_update_price_event(
            &sale.owner_id,
            &nft_contract_id,
            &token_id,
            old_price,
            price,
        );
        
        env::log_str(&format!(
            "Price updated: {}.{} now listed for {} yoctoNEAR",
            nft_contract_id, token_id, price.0
        ));
    }
    
    /// Purchase an NFT (optional gas overrides for complex NFT contracts)
    /// Only works for External NFT sales (use purchase_from_collection for lazy-minted)
    #[payable]
    pub fn offer(
        &mut self,
        nft_contract_id: AccountId,
        token_id: String,
        max_len_payout: Option<u32>,
        nft_transfer_gas_tgas: Option<u64>,
        resolve_purchase_gas_tgas: Option<u64>,
    ) -> Promise {
        let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");
        
        // Check if sale has expired
        if let Some(expiration) = sale.expires_at {
            let now = env::block_timestamp();
            assert!(
                now <= expiration,
                "Sale has expired (expired at: {}, current time: {})",
                expiration, now
            );
        }
        
        // Extract external NFT info
        let (contract_id, tok_id, approval_id) = match &sale.sale_type {
            SaleType::External {
                nft_contract_id,
                token_id,
                approval_id,
            } => (nft_contract_id.clone(), token_id.clone(), *approval_id),
            SaleType::LazyCollection { .. } => {
                panic!("Use purchase_from_collection() for lazy-minted NFTs");
            }
        };
        
        let buyer_id = env::predecessor_account_id();
        let price = sale.sale_conditions.0;
        let deposit = env::attached_deposit().as_yoctonear();
        
        assert!(deposit >= price, "Attached deposit {} is less than price {}", deposit, price);
        
        // Use provided values or sensible defaults (10 recipients = industry standard, 20 max for edge cases)
        let max_payout_recipients = max_len_payout.unwrap_or(10).min(20);
        let transfer_gas = nft_transfer_gas_tgas.unwrap_or(DEFAULT_NFT_TRANSFER_GAS);
        
        // Dynamic resolve gas based on recipient count: 125 TGas for 10, 200 TGas for 20
        let default_resolve_gas = if max_payout_recipients <= 10 { 
            DEFAULT_RESOLVE_PURCHASE_GAS 
        } else { 
            MAX_RESOLVE_PURCHASE_GAS 
        };
        let resolve_gas = resolve_purchase_gas_tgas.unwrap_or(default_resolve_gas);
        
        ext_nft_contract::ext(contract_id.clone())
            .with_static_gas(Gas::from_tgas(transfer_gas))
            .with_attached_deposit(ONE_YOCTO)
            .nft_transfer_payout(
                buyer_id.clone(),
                tok_id.clone(),
                approval_id,
                Some(format!("Purchased from marketplace")),
                U128(price),
                max_payout_recipients,
            )
            .then(
                ext_self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(resolve_gas))
                    .resolve_purchase(buyer_id, U128(price), contract_id, tok_id)
            )
    }
    
    /// Resolve purchase and distribute payments
    #[private]
    pub fn resolve_purchase(
        &mut self,
        buyer_id: AccountId,
        price: U128,
        nft_contract_id: AccountId,
        token_id: String,
    ) -> U128 {
        // Check if NFT transfer succeeded
        let payout_option = match env::promise_result(0) {
            PromiseResult::Successful(value) => {
                // Try to parse payout
                if let Ok(payout) = near_sdk::serde_json::from_slice::<Payout>(&value) {
                    // Validate payout structure
                    assert!(
                        !payout.payout.is_empty(),
                        "Invalid payout: empty payout structure"
                    );
                    
                    // Validate no zero amounts (waste of gas)
                    for (receiver, amount) in payout.payout.iter() {
                        assert!(
                            amount.0 > 0,
                            "Invalid payout: zero amount for {}",
                            receiver
                        );
                    }
                    
                    Some(payout)
                } else {
                    env::log_str("Warning: Could not parse payout, assuming direct transfer");
                    None
                }
            }
            _ => {
                // Transfer failed, refund buyer and keep sale active
                env::log_str("NFT transfer failed, refunding buyer and keeping sale active");
                
                // Get sale info for event (sale remains in storage)
                let sale_id = Contract::make_sale_id(&nft_contract_id, &token_id);
                let sale = self.sales.get(&sale_id);
                
                // Emit failed purchase event for analytics
                if let Some(sale) = sale {
                    crate::events::emit_nft_purchase_failed_event(
                        &buyer_id,
                        &sale.owner_id,
                        &nft_contract_id,
                        &token_id,
                        price,
                        "nft_transfer_failed",
                    );
                } else {
                    env::log_str("Warning: Sale not found during failure handling");
                }
                
                // Refund the buyer (critical: return their money)
                if price.0 > 0 {
                    Promise::new(buyer_id.clone()).transfer(NearToken::from_yoctonear(price.0));
                }
                
                // Sale remains active for retry - do NOT remove it
                return U128(0);
            }
        };
        
        // Only remove the sale if transfer succeeded
        let sale = self.internal_remove_sale(nft_contract_id.clone(), token_id.clone());
        
        // Calculate marketplace fee (2.5%)
        let marketplace_fee = (price.0 * MARKETPLACE_FEE_BPS as u128) / BASIS_POINTS as u128;
        let amount_after_fee = price.0.saturating_sub(marketplace_fee);
        
        // Distribute payments
        if let Some(payout) = payout_option {
            // Validate payout
            let mut total_payout: u128 = 0;
            for amount in payout.payout.values() {
                total_payout += amount.0;
            }
            
            // Ensure payout doesn't exceed price (before fee)
            assert!(
                total_payout <= price.0,
                "Payout exceeds sale price"
            );
            
            // Calculate scale factor to reduce payouts proportionally to leave room for marketplace fee
            // This ensures royalties and seller get correct proportions from amount_after_fee
            let scale_factor = if total_payout > 0 {
                (amount_after_fee * 10_000) / total_payout
            } else {
                10_000
            };
            
            let mut actual_distributed: u128 = 0;
            
            // Distribute to all beneficiaries (scaled down proportionally)
            for (receiver, amount) in payout.payout.iter() {
                if amount.0 > 0 {
                    let scaled_amount = (amount.0 * scale_factor) / 10_000;
                    if scaled_amount > 0 {
                        Promise::new(receiver.clone()).transfer(NearToken::from_yoctonear(scaled_amount));
                        actual_distributed += scaled_amount;
                    }
                }
            }
            
            // Handle any rounding dust - refund to buyer or add to fee
            let remaining = amount_after_fee.saturating_sub(actual_distributed);
            if remaining > 0 {
                // If there's remaining dust, add it to marketplace fee to avoid complexity
                // (alternatively could refund to buyer, but this is cleaner)
                Promise::new(self.fee_recipient.clone())
                    .transfer(NearToken::from_yoctonear(marketplace_fee + remaining));
            } else {
                // Transfer marketplace fee to fee recipient
                if marketplace_fee > 0 {
                    Promise::new(self.fee_recipient.clone())
                        .transfer(NearToken::from_yoctonear(marketplace_fee));
                }
            }
            
            env::log_str(&format!(
                "Purchase completed: {} bought {}.{} for {} yoctoNEAR (marketplace fee: {} yoctoNEAR)",
                buyer_id, nft_contract_id, token_id, price.0, marketplace_fee
            ));
        } else {
            // No payout structure - pay seller directly (minus marketplace fee)
            if amount_after_fee > 0 {
                Promise::new(sale.owner_id.clone()).transfer(NearToken::from_yoctonear(amount_after_fee));
            }
            
            // Transfer marketplace fee to fee recipient
            if marketplace_fee > 0 {
                Promise::new(self.fee_recipient.clone())
                    .transfer(NearToken::from_yoctonear(marketplace_fee));
            }
            
            env::log_str(&format!(
                "Purchase completed (direct): {} bought {}.{} for {} yoctoNEAR (marketplace fee: {} yoctoNEAR)",
                buyer_id, nft_contract_id, token_id, price.0, marketplace_fee
            ));
        }
        
        // Emit OnSocial event
        crate::events::emit_nft_purchase_event(
            &buyer_id,
            &sale.owner_id,
            &nft_contract_id,
            &token_id,
            price,
            marketplace_fee,
        );
        
        price
    }
}
