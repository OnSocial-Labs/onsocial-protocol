use crate::*;
use near_sdk::serde_json;
use std::collections::HashMap;

impl Contract {
    pub(crate) fn mint(
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
            paid_price: U128(ovr.paid_price),
            refunded: false,
            transferable: ovr.transferable,
            burnable: ovr.burnable,
            app_id: ovr.app_id,
        };

        self.scarces_by_id.insert(token_id.clone(), token);
        self.add_token_to_owner(&owner_id, &token_id);

        Ok(token_id)
    }

    pub(crate) fn quick_mint(
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
        self.mint(token_id.clone(), ctx, metadata, Some(ovr))?;

        let bytes_used = env::storage_usage().saturating_sub(before);
        self.charge_storage_waterfall(actor_id, bytes_used, app_id.as_ref())?;

        crate::events::emit_quick_mint(actor_id, &token_id);
        Ok(token_id)
    }

    pub(crate) fn batch_mint(
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
                self.mint(token_id.clone(), ctx.clone(), metadata, overrides.clone())?;
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

        if metadata.copies.is_none() {
            if let Some(collection) = self.collections.get(collection_id) {
                metadata.copies = Some(collection.total_supply as u64);
            }
        }

        Ok(metadata)
    }
}
