use crate::*;

#[near]
impl Contract {
    /// NEP-178 callback invoked by an external NFT contract after it approves the marketplace.
    /// If `msg` contains `{"sale_conditions": "<yoctoNEAR>"}` and the caller is allowlisted,
    /// auto-creates a fixed-price listing. Otherwise, acknowledges without side-effects.
    #[payable]
    #[handle_result]
    pub fn nft_on_approve(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    ) -> Result<PromiseOrValue<String>, MarketplaceError> {
        let scarce_contract_id = env::predecessor_account_id();
        let signer_id = env::signer_account_id();

        if scarce_contract_id == signer_id || scarce_contract_id == env::current_account_id() {
            return Err(MarketplaceError::Unauthorized(
                "nft_on_approve must be called by an NFT contract".to_string(),
            ));
        }

        if token_id.len() > MAX_TOKEN_ID_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Token ID too long (max {} characters)",
                MAX_TOKEN_ID_LEN
            )));
        }

        if owner_id != signer_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can approve the marketplace".to_string(),
            ));
        }

        // `predecessor_account_id` is the only unforgeable input; all other params are caller-supplied.
        if !self.approved_nft_contracts.contains(&scarce_contract_id) {
            env::log_str(&format!(
                "Marketplace approved for {}.{} by {} (contract not allowlisted — use list_scarce_for_sale to list)",
                scarce_contract_id, token_id, owner_id
            ));
            return Ok(PromiseOrValue::Value("Approval acknowledged".to_string()));
        }

        if !msg.is_empty() {
            if let Ok(sale_data) =
                near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(&msg)
            {
                if let Some(sale_conditions) = sale_data.get("sale_conditions") {
                    if let Some(price_str) = sale_conditions.as_str() {
                        if let Ok(price) = price_str.parse::<u128>() {
                            if price == 0 {
                                return Err(MarketplaceError::InvalidInput(
                                    "Price must be greater than 0".to_string(),
                                ));
                            }

                            let sale_id =
                                Contract::make_sale_id(&scarce_contract_id, &token_id);
                            if self.sales.contains_key(&sale_id) {
                                env::log_str(&format!(
                                    "Sale already exists for {}.{} — use update_price to change",
                                    scarce_contract_id, token_id
                                ));
                                return Ok(PromiseOrValue::Value(
                                    "Sale already exists".to_string(),
                                ));
                            }

                            let sale = Sale {
                                owner_id: owner_id.clone(),
                                sale_conditions: U128(price),
                                sale_type: SaleType::External {
                                    scarce_contract_id: scarce_contract_id.clone(),
                                    token_id: token_id.clone(),
                                    approval_id,
                                },
                                expires_at: None,
                                auction: None,
                            };

                            let before = env::storage_usage();
                            self.internal_add_sale(sale);
                            let after = env::storage_usage();
                            let bytes_used = after.saturating_sub(before);

                            self.charge_storage_waterfall(&owner_id, bytes_used as u64, None)?;

                            crate::events::emit_scarce_list(
                                &owner_id,
                                &scarce_contract_id,
                                vec![token_id.clone()],
                                vec![U128(price)],
                            );

                            return Ok(PromiseOrValue::Value("Listed successfully".to_string()));
                        }
                    }
                }
            }
        }

        env::log_str(&format!(
            "Marketplace approved for {}.{} by {}",
            scarce_contract_id, token_id, owner_id
        ));

        Ok(PromiseOrValue::Value("Approval acknowledged".to_string()))
    }
}
