use crate::external::*;
use crate::guards::*;
use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
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
        if sale_conditions.0 == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Price must be greater than 0".into(),
            ));
        }

        let owner_id = env::predecessor_account_id();

        let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
        if self.sales.contains_key(&sale_id) {
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

        if let Some(tgas) = approval_gas_tgas {
            if tgas > 300 {
                return Err(MarketplaceError::InvalidInput(
                    "approval_gas_tgas exceeds maximum of 300".into(),
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
                    .nft_token(token_id.clone()),
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

        let token_owner = match env::promise_result_checked(1, MAX_METADATA_LEN) {
            Ok(value) => {
                match near_sdk::serde_json::from_slice::<Option<crate::external::Token>>(&value) {
                    Ok(Some(token)) => token.owner_id,
                    Ok(None) => {
                        env::log_str("Listing failed: token not found on external contract");
                        return;
                    }
                    Err(_) => {
                        env::log_str("Listing failed: could not parse token");
                        return;
                    }
                }
            }
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

        let sale_id_check = Contract::make_sale_id(&scarce_contract_id, &token_id);
        if self.sales.contains_key(&sale_id_check) {
            env::log_str("Listing skipped: sale already exists (concurrent listing)");
            return;
        }

        let before = self.storage_usage_flushed();
        self.add_sale(sale);
        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // Storage/accounting invariant: rollback sale insertion if storage charge fails.
        if let Err(e) = self.charge_storage_waterfall(&owner_id, bytes_used, None) {
            let _ = self.remove_sale(scarce_contract_id.clone(), token_id.clone());
            env::log_str(&format!(
                "Listing storage charge failed (rolled back): {}",
                e
            ));
            return;
        }

        events::emit_scarce_list(
            &owner_id,
            &scarce_contract_id,
            vec![token_id],
            vec![sale_conditions],
        );
    }
}

impl Contract {
    pub(crate) fn list_native_scarce(
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
        if price.0 == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Price must be greater than 0".into(),
            ));
        }

        self.check_transferable(token, token_id, "list for sale")?;

        let token_app_id = token.app_id.clone();

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

        let before = self.storage_usage_flushed();
        self.add_sale(sale);
        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // Accounting invariant: resolve token app context before storage charge routing.
        let app_id = self.resolve_token_app_id(token_id, token_app_id.as_ref());
        // Storage/accounting invariant: rollback sale if storage charge fails.
        if let Err(e) = self.charge_storage_waterfall(owner_id, bytes_used, app_id.as_ref()) {
            let _ = self.remove_sale(env::current_account_id(), token_id.to_string());
            return Err(e);
        }

        events::emit_native_scarce_listed(owner_id, token_id, price);
        Ok(())
    }

    pub(crate) fn delist_native_scarce(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found for this token".into()))?;

        if &sale.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the owner can delist".into(),
            ));
        }

        let listing_app_id = {
            let token_app_id = self
                .scarces_by_id
                .get(token_id)
                .and_then(|t| t.app_id.clone());
            self.resolve_token_app_id(token_id, token_app_id.as_ref())
        };
        let before_remove = self.storage_usage_flushed();
        self.remove_sale(env::current_account_id(), token_id.to_string())?;
        let bytes_freed = before_remove.saturating_sub(self.storage_usage_flushed());
        self.release_storage_waterfall(owner_id, bytes_freed, listing_app_id.as_ref());

        events::emit_native_scarce_delisted(owner_id, token_id);
        Ok(())
    }
}

impl Contract {
    pub(crate) fn delist_scarce(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        if actor_id != &sale.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only owner can delist".into(),
            ));
        }
        let owner_id = sale.owner_id.clone();
        let before_remove = self.storage_usage_flushed();
        self.remove_sale(scarce_contract_id.clone(), token_id.to_string())?;
        let bytes_freed = before_remove.saturating_sub(self.storage_usage_flushed());
        self.release_storage_waterfall(&owner_id, bytes_freed, None);
        events::emit_scarce_delist(&owner_id, scarce_contract_id, vec![token_id.to_string()]);
        Ok(())
    }

    pub(crate) fn update_price(
        &mut self,
        actor_id: &AccountId,
        scarce_contract_id: &AccountId,
        token_id: &str,
        price: U128,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Self::make_sale_id(scarce_contract_id, token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        if actor_id != &sale.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only owner can update price".into(),
            ));
        }
        if price.0 == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Price must be greater than 0".into(),
            ));
        }
        let old_price = sale.sale_conditions;
        let owner_id = sale.owner_id.clone();
        let mut sale = sale.clone();
        sale.sale_conditions = price;
        self.sales.insert(sale_id, sale);
        events::emit_scarce_update_price(&owner_id, scarce_contract_id, token_id, old_price, price);
        Ok(())
    }
}
