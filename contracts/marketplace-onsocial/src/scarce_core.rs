use crate::internal::check_one_yocto;
use crate::*;
use near_sdk::serde_json;
use std::collections::HashMap;

impl Contract {
    pub(crate) fn internal_mint(
        &mut self,
        token_id: String,
        ctx: crate::MintContext,
        metadata: TokenMetadata,
        overrides: Option<crate::ScarceOverrides>,
    ) -> Result<String, MarketplaceError> {
        if token_id.len() > MAX_TOKEN_ID_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Token ID exceeds max length of {}",
                MAX_TOKEN_ID_LEN
            )));
        }

        let metadata_json = serde_json::to_string(&metadata)
            .map_err(|_| MarketplaceError::InternalError("Failed to serialize metadata".into()))?;
        let metadata_size = metadata_json.len();
        if metadata_size > MAX_METADATA_LEN {
            return Err(MarketplaceError::InvalidInput(format!(
                "Metadata exceeds max length of {} bytes (got {} bytes)",
                MAX_METADATA_LEN, metadata_size
            )));
        }

        if self.scarces_by_id.contains_key(&token_id) {
            return Err(MarketplaceError::InvalidState(
                "Token ID already exists".into(),
            ));
        }

        let ovr = overrides.unwrap_or_default();

        let owner_id = ctx.owner_id.clone();
        let token = Scarce {
            owner_id: ctx.owner_id,
            creator_id: ctx.creator_id,
            minter_id: ctx.minter_id,
            metadata,
            approved_account_ids: HashMap::new(),
            royalty: ovr.royalty,
            revoked_at: None,
            revocation_memo: None,
            redeemed_at: None,
            redeem_count: 0,
            paid_price: ovr.paid_price,
            refunded: false,
            transferable: ovr.transferable,
            burnable: ovr.burnable,
            app_id: ovr.app_id,
        };

        self.scarces_by_id.insert(token_id.clone(), token);
        self.add_token_to_owner(&owner_id, &token_id);

        Ok(token_id)
    }

    pub(crate) fn internal_quick_mint(
        &mut self,
        actor_id: &AccountId,
        metadata: crate::TokenMetadata,
        options: crate::ScarceOptions,
    ) -> Result<String, MarketplaceError> {
        let crate::ScarceOptions {
            royalty,
            app_id,
            transferable,
            burnable,
        } = options;

        if let Some(ref app) = app_id {
            if !self.app_pools.contains_key(app) {
                return Err(MarketplaceError::NotFound("App pool not found".into()));
            }
        }

        let merged_royalty = self.merge_royalties(app_id.as_ref(), royalty)?;
        let id = self.next_token_id;
        self.next_token_id = self
            .next_token_id
            .checked_add(1)
            .ok_or_else(|| MarketplaceError::InternalError("Token ID counter overflow".into()))?;
        let token_id = format!("s:{id}");

        let before = env::storage_usage();

        let ctx = crate::MintContext {
            owner_id: actor_id.clone(),
            creator_id: actor_id.clone(),
            minter_id: actor_id.clone(),
        };
        let ovr = crate::ScarceOverrides {
            royalty: merged_royalty,
            app_id: app_id.clone(),
            transferable: Some(transferable),
            burnable: Some(burnable),
            paid_price: 0,
        };
        self.internal_mint(token_id.clone(), ctx, metadata, Some(ovr))?;

        let bytes_used = env::storage_usage().saturating_sub(before);
        self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_ref())?;

        crate::events::emit_quick_mint(actor_id, &token_id);
        Ok(token_id)
    }

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

    pub(crate) fn internal_batch_mint(
        &mut self,
        ctx: &crate::MintContext,
        token_ids: Vec<String>,
        metadata_template: &str,
        collection_id: &str,
        overrides: Option<crate::ScarceOverrides>,
    ) -> Result<Vec<String>, MarketplaceError> {
        if token_ids.is_empty() {
            return Err(MarketplaceError::InvalidInput(
                "Batch must contain at least one token".into(),
            ));
        }
        if token_ids.len() as u32 > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Cannot mint more than {} tokens at once",
                MAX_BATCH_MINT
            )));
        }

        let mut minted_tokens = Vec::new();

        for (index, token_id) in token_ids.iter().enumerate() {
            let metadata = self.generate_metadata_from_template(
                metadata_template,
                token_id,
                index as u32,
                &ctx.owner_id,
                collection_id,
            )?;

            let minted_id =
                self.internal_mint(token_id.clone(), ctx.clone(), metadata, overrides.clone())?;
            minted_tokens.push(minted_id);
        }

        Ok(minted_tokens)
    }

    pub(crate) fn generate_metadata_from_template(
        &self,
        template: &str,
        token_id: &str,
        index: u32,
        owner: &AccountId,
        collection_id: &str,
    ) -> Result<TokenMetadata, MarketplaceError> {
        let mut metadata: TokenMetadata = serde_json::from_str(template)
            .map_err(|_| MarketplaceError::InvalidInput("Invalid metadata template".into()))?;

        let seat_number = index + 1;
        let timestamp = env::block_timestamp();

        let index_str = index.to_string();
        let seat_str = seat_number.to_string();
        let timestamp_str = timestamp.to_string();

        if let Some(ref mut title) = metadata.title {
            *title = title
                .replace("{token_id}", token_id)
                .replace("{index}", &index_str)
                .replace("{seat_number}", &seat_str)
                .replace("{collection_id}", collection_id);
        }

        if let Some(ref mut description) = metadata.description {
            *description = description
                .replace("{token_id}", token_id)
                .replace("{index}", &index_str)
                .replace("{seat_number}", &seat_str)
                .replace("{collection_id}", collection_id)
                .replace("{owner}", owner.as_str());
        }

        if let Some(ref mut media) = metadata.media {
            *media = media
                .replace("{token_id}", token_id)
                .replace("{index}", &index_str)
                .replace("{seat_number}", &seat_str)
                .replace("{collection_id}", collection_id);
        }

        if let Some(ref mut reference) = metadata.reference {
            *reference = reference
                .replace("{token_id}", token_id)
                .replace("{index}", &index_str)
                .replace("{seat_number}", &seat_str)
                .replace("{collection_id}", collection_id);
        }

        if let Some(ref mut extra) = metadata.extra {
            *extra = extra
                .replace("{token_id}", token_id)
                .replace("{index}", &index_str)
                .replace("{seat_number}", &seat_str)
                .replace("{collection_id}", collection_id)
                .replace("{owner}", owner.as_str())
                .replace("{minted_at}", &timestamp_str);
        }

        metadata.issued_at = Some(timestamp);

        // Enables "Edition X of Y" display in wallets (NEP-177).
        if metadata.copies.is_none() {
            if let Some(collection) = self.collections.get(collection_id) {
                metadata.copies = Some(collection.total_supply as u64);
            }
        }

        Ok(metadata)
    }
}

#[near]
impl Contract {
    /// Owner-only. Panics if not exactly 1 yoctoNEAR attached.
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
