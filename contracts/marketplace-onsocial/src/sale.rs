//! Sale listing and purchase functions with split-fee sponsorship.

use crate::external::*;
use crate::internal::*;
use crate::*;
use near_sdk::json_types::U128;


#[near]
impl Contract {
    /// List a Scarce for sale (requires cross-contract approval verification).
    #[payable]
    pub fn list_scarce_for_sale(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
        approval_gas_tgas: Option<u64>,
    ) -> Promise {
        assert_at_least_one_yocto();
        assert!(
            token_id.len() <= MAX_TOKEN_ID_LEN,
            "Token ID too long (max {} characters)",
            MAX_TOKEN_ID_LEN
        );

        let owner_id = env::predecessor_account_id();
        self.assert_storage_available(&owner_id);

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        assert!(
            self.sales.get(&sale_id).is_none(),
            "Sale already exists for this scarce"
        );

        if let Some(expiration) = expires_at {
            let now = env::block_timestamp();
            assert!(
                expiration > now,
                "Expiration must be in the future"
            );
        }

        let approval_gas = Gas::from_tgas(approval_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));

        ext_scarce_contract::ext(scarce_contract_id.clone())
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
            )
    }

    /// Callback to process listing after verification.
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
        assert_eq!(env::promise_results_count(), 2, "Expected 2 promise results");

        let is_approved = match env::promise_result_checked(0, 16) {
            Ok(value) => near_sdk::serde_json::from_slice::<bool>(&value)
                .expect("Failed to parse approval result"),
            Err(_) => panic!("Approval check failed"),
        };
        assert!(is_approved, "Marketplace is not approved for this token");

        let token_owner = match env::promise_result_checked(1, 128) {
            Ok(value) => {
                near_sdk::serde_json::from_slice::<AccountId>(&value)
                    .expect("Failed to parse owner result")
            }
            Err(_) => panic!("Owner check failed"),
        };
        assert_eq!(token_owner, owner_id, "Only the token owner can list it for sale");

        let sale = Sale {
            owner_id: owner_id.clone(),
            sale_conditions,
            sale_type: SaleType::External {
                scarce_contract_id: scarce_contract_id.clone(),
                token_id: token_id.clone(),
                approval_id,
            },
            expires_at,
        };

        self.internal_add_sale(sale);

        events::emit_scarce_list(
            &owner_id,
            &scarce_contract_id,
            vec![token_id],
            vec![sale_conditions],
        );
    }

    /// Remove a scarce from sale.
    #[payable]
    pub fn remove_sale(&mut self, scarce_contract_id: AccountId, token_id: String) {
        assert_one_yocto();

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");

        assert_eq!(
            env::predecessor_account_id(),
            sale.owner_id,
            "Only the owner can remove the sale"
        );

        let owner_id = sale.owner_id.clone();
        self.internal_remove_sale(scarce_contract_id.clone(), token_id.clone());

        events::emit_scarce_delist(&owner_id, &scarce_contract_id, vec![token_id]);
    }

    /// Update the price of a listing.
    #[payable]
    pub fn update_price(&mut self, scarce_contract_id: AccountId, token_id: String, price: U128) {
        assert_one_yocto();

        let caller = env::predecessor_account_id();
        self.internal_update_price(&caller, &scarce_contract_id, &token_id, price);
    }

    /// Purchase an external Scarce.
    #[payable]
    pub fn offer(
        &mut self,
        scarce_contract_id: AccountId,
        token_id: String,
        max_len_payout: Option<u32>,
        scarce_transfer_gas_tgas: Option<u64>,
        resolve_purchase_gas_tgas: Option<u64>,
    ) -> Promise {
        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        let sale = self.sales.get(&sale_id).expect("No sale found");

        if let Some(expiration) = sale.expires_at {
            assert!(
                env::block_timestamp() <= expiration,
                "Sale has expired"
            );
        }

        let (contract_id, tok_id, approval_id) = match &sale.sale_type {
            SaleType::External {
                scarce_contract_id,
                token_id,
                approval_id,
            } => (scarce_contract_id.clone(), token_id.clone(), *approval_id),
            SaleType::LazyCollection { .. } => {
                panic!("Use purchase_from_collection() for lazy-minted scarces");
            }
        };

        let buyer_id = env::predecessor_account_id();
        let price = sale.sale_conditions.0;
        let deposit = env::attached_deposit().as_yoctonear();

        assert!(
            deposit >= price,
            "Attached deposit {} is less than price {}",
            deposit,
            price
        );

        let max_payout_recipients = max_len_payout.unwrap_or(10).min(20);
        let transfer_gas = scarce_transfer_gas_tgas.unwrap_or(DEFAULT_SCARCE_TRANSFER_GAS);
        let default_resolve_gas = if max_payout_recipients <= 10 {
            DEFAULT_RESOLVE_PURCHASE_GAS
        } else {
            MAX_RESOLVE_PURCHASE_GAS
        };
        let resolve_gas = resolve_purchase_gas_tgas.unwrap_or(default_resolve_gas);

        ext_scarce_contract::ext(contract_id.clone())
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
            )
    }

    /// Resolve purchase: distribute payments with fee split.
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
                    assert!(!payout.payout.is_empty(), "Invalid payout: empty");
                    for (receiver, amount) in payout.payout.iter() {
                        assert!(amount.0 > 0, "Invalid payout: zero amount for {}", receiver);
                    }
                    Some(payout)
                } else {
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

        let sale = self.internal_remove_sale(scarce_contract_id.clone(), token_id.clone());

        // Split fee: revenue to platform + portion to sponsor fund
        let (revenue, sponsor_amount) = self.route_fee(price.0);
        let total_fee = revenue + sponsor_amount;
        let amount_after_fee = price.0.saturating_sub(total_fee);

        if let Some(payout) = payout_option {
            let total_payout: u128 = payout.payout.values().map(|a| a.0).sum();
            assert!(total_payout <= price.0, "Payout exceeds sale price");

            let scale_factor = if total_payout > 0 {
                (amount_after_fee * 10_000) / total_payout
            } else {
                10_000
            };

            let mut actual_distributed: u128 = 0;
            for (receiver, amount) in payout.payout.iter() {
                if amount.0 > 0 {
                    let scaled_amount = (amount.0 * scale_factor) / 10_000;
                    if scaled_amount > 0 {
                        let _ = Promise::new(receiver.clone())
                            .transfer(NearToken::from_yoctonear(scaled_amount));
                        actual_distributed += scaled_amount;
                    }
                }
            }

            // Dust goes to fee recipient
            let remaining = amount_after_fee.saturating_sub(actual_distributed);
            if remaining > 0 {
                let _ = Promise::new(self.fee_recipient.clone())
                    .transfer(NearToken::from_yoctonear(remaining));
            }
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
            sponsor_amount,
        );

        price
    }
}
