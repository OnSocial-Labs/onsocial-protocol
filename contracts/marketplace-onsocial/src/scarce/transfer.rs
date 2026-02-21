//! Token transfers: single, batch, NEP-171 nft_transfer / nft_transfer_call / nft_resolve_transfer.

use crate::guards::check_one_yocto;
use crate::*;

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn burn_scarce(
        &mut self,
        token_id: String,
        collection_id: Option<String>,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        match collection_id {
            Some(cid) => self.internal_burn_scarce(&caller, &token_id, &cid),
            None => self.internal_burn_standalone(&caller, &token_id),
        }
    }

    /// Panics if not exactly 1 yoctoNEAR attached.
    #[payable]
    #[handle_result]
    pub fn nft_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let sender_id = env::predecessor_account_id();

        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)
    }

    /// Transfer token and call receiver contract (NEP-171).
    /// Panics if not exactly 1 yoctoNEAR attached or gas override exceeds 300 TGas.
    #[payable]
    #[handle_result]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
        gas_overrides: Option<GasOverrides>,
    ) -> Result<Promise, MarketplaceError> {
        check_one_yocto()?;
        let sender_id = env::predecessor_account_id();

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        let previous_owner_id = token.owner_id.clone();
        let previous_approvals = token.approved_account_ids.clone();

        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)?;

        let overrides = gas_overrides.unwrap_or(GasOverrides {
            receiver_tgas: None,
            resolve_tgas: None,
        });
        if overrides.receiver_tgas.unwrap_or(0) > 300 || overrides.resolve_tgas.unwrap_or(0) > 300 {
            return Err(MarketplaceError::InvalidInput(
                "Gas override exceeds 300 TGas".into(),
            ));
        }
        let receiver_gas = Gas::from_tgas(overrides.receiver_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));
        let resolve_gas = Gas::from_tgas(overrides.resolve_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));

        Ok(
            external::ext_scarce_transfer_receiver::ext(receiver_id.clone())
                .with_static_gas(receiver_gas)
                .nft_on_transfer(
                    sender_id.clone(),
                    previous_owner_id.clone(),
                    token_id.clone(),
                    msg,
                )
                .then(
                    external::ext_self::ext(env::current_account_id())
                        .with_static_gas(resolve_gas)
                        .nft_resolve_transfer(
                            previous_owner_id,
                            receiver_id,
                            token_id,
                            Some(previous_approvals),
                        ),
                ),
        )
    }

    /// Resolve transfer after callback (NEP-171). Only callable by this contract.
    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: String,
        approved_account_ids: Option<std::collections::HashMap<AccountId, u64>>,
    ) -> bool {
        let should_revert = match env::promise_result_checked(0, 16) {
            Ok(value) => near_sdk::serde_json::from_slice::<bool>(&value).unwrap_or(false),
            Err(_) => false, // failed/panicked callback = accept transfer (NEP-171)
        };

        if !should_revert {
            return false;
        }

        // Safety: must not panic — token may be re-transferred or burned during callback window.
        let token_opt = self.scarces_by_id.get(&token_id).cloned();
        let mut token = match token_opt {
            Some(t) => t,
            None => {
                env::log_str(&format!(
                    "Cannot revert transfer: token {} no longer exists",
                    token_id
                ));
                return false;
            }
        };

        // Ownership changed during callback window; accept transfer as final.
        if token.owner_id != receiver_id {
            return false;
        }

        self.remove_token_from_owner(&receiver_id, &token_id);

        token.owner_id = previous_owner_id.clone();
        if let Some(approvals) = approved_account_ids {
            token.approved_account_ids = approvals;
        }

        self.add_token_to_owner(&previous_owner_id, &token_id);
        self.scarces_by_id.insert(token_id.clone(), token);

        events::emit_scarce_transfer(
            &receiver_id,
            &receiver_id,
            &previous_owner_id,
            &token_id,
            Some("transfer reverted"),
        );

        true
    }

    pub fn nft_token(&self, token_id: String) -> Option<external::Token> {
        self.scarces_by_id
            .get(&token_id)
            .map(|token| external::Token {
                token_id: token_id.clone(),
                owner_id: token.owner_id.clone(),
                metadata: Some(token.metadata.clone()),
                approved_account_ids: Some(token.approved_account_ids.clone()),
            })
    }
}

impl Contract {
    pub(crate) fn internal_transfer(
        &mut self,
        sender_id: &AccountId,
        receiver_id: &AccountId,
        token_id: &str,
        approval_id: Option<u64>,
        memo: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        self.check_transferable(&token, token_id, "transfer")?;

        // Captured before mutation; sale index is keyed on the original owner.
        let old_owner_id = token.owner_id.clone();

        if sender_id != &token.owner_id {
            if let Some(approved_id) = approval_id {
                let actual_approval_id = token
                    .approved_account_ids
                    .get(sender_id)
                    .ok_or_else(|| MarketplaceError::Unauthorized("Sender not approved".into()))?;

                if approved_id != *actual_approval_id {
                    return Err(MarketplaceError::Unauthorized("Invalid approval ID".into()));
                }
            } else if !token.approved_account_ids.contains_key(sender_id) {
                return Err(MarketplaceError::Unauthorized(
                    "Sender not authorized to transfer token".into(),
                ));
            }
        }

        self.remove_token_from_owner(&token.owner_id, token_id);

        token.owner_id = receiver_id.clone();
        token.approved_account_ids.clear();

        self.add_token_to_owner(receiver_id, token_id);
        self.scarces_by_id.insert(token_id.to_string(), token);

        self.internal_remove_sale_listing(token_id, &old_owner_id, "owner_changed");
        events::emit_scarce_transfer(sender_id, &old_owner_id, receiver_id, token_id, memo.as_deref());

        Ok(())
    }

    // Transfers all items atomically; fails entirely on first error.
    pub(crate) fn internal_batch_transfer(
        &mut self,
        actor_id: &AccountId,
        transfers: Vec<crate::protocol::TransferItem>,
    ) -> Result<(), MarketplaceError> {
        if transfers.is_empty() || transfers.len() as u32 > MAX_BATCH_TRANSFER {
            return Err(MarketplaceError::InvalidInput(format!(
                "Batch size must be 1-{}",
                MAX_BATCH_TRANSFER
            )));
        }

        for item in &transfers {
            self.internal_transfer(
                actor_id,
                &item.receiver_id,
                &item.token_id,
                None,
                item.memo.clone(),
            )?;
        }
        Ok(())
    }
}
