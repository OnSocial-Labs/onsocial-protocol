// NFT callback implementations (NEP-178)

use crate::*;

#[near]
impl Contract {
    /// Called by NFT contract when marketplace is approved
    /// This is part of the NEP-178 approval management standard
    ///
    /// Can be used to automatically list an NFT when approved,
    /// or just as a notification that approval was granted
    pub fn nft_on_approve(
        &mut self,
        token_id: String,
        owner_id: AccountId,
        approval_id: u64,
        msg: String,
    ) -> PromiseOrValue<String> {
        let nft_contract_id = env::predecessor_account_id();
        let signer_id = env::signer_account_id();

        // Validate token_id length to prevent storage DoS
        assert!(
            token_id.len() <= MAX_TOKEN_ID_LEN,
            "Token ID too long (max {} characters)",
            MAX_TOKEN_ID_LEN
        );

        // Verify the signer is the owner
        assert_eq!(
            owner_id, signer_id,
            "Only the token owner can approve the marketplace"
        );

        // Parse the message to get sale conditions
        // Message format: {"sale_conditions": "1000000000000000000000000"}
        if !msg.is_empty() {
            if let Ok(sale_data) =
                near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(&msg)
            {
                if let Some(sale_conditions) = sale_data.get("sale_conditions") {
                    if let Some(price_str) = sale_conditions.as_str() {
                        if let Ok(price) = price_str.parse::<u128>() {
                            // Check storage availability
                            self.assert_storage_available(&owner_id);

                            // Create and store the sale (no expiration for auto-listed sales)
                            let sale = Sale {
                                owner_id: owner_id.clone(),
                                sale_conditions: U128(price),
                                sale_type: SaleType::External {
                                    nft_contract_id: nft_contract_id.clone(),
                                    token_id: token_id.clone(),
                                    approval_id,
                                },
                                expires_at: None, // Auto-listed sales don't expire by default
                            };

                            self.internal_add_sale(sale);

                            // Emit OnSocial event
                            crate::events::emit_nft_list_event(
                                &owner_id,
                                &nft_contract_id,
                                vec![token_id.clone()],
                                vec![U128(price)],
                            );

                            env::log_str(&format!(
                                "NFT auto-listed: {} listed {}.{} for {} yoctoNEAR via approval",
                                owner_id, nft_contract_id, token_id, price
                            ));

                            return PromiseOrValue::Value("Listed successfully".to_string());
                        }
                    }
                }
            }
        }

        // If no valid message, just acknowledge approval
        env::log_str(&format!(
            "Marketplace approved for {}.{} by {}",
            nft_contract_id, token_id, owner_id
        ));

        PromiseOrValue::Value("Approval acknowledged".to_string())
    }
}
