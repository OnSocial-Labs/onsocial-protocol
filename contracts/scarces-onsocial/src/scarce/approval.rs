use crate::guards::{check_at_least_one_yocto, check_one_yocto};
use crate::*;

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn nft_approve(
        &mut self,
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
    ) -> Result<Option<Promise>, MarketplaceError> {
        check_at_least_one_yocto()?;

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        let owner_id = env::predecessor_account_id();
        if token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only token owner can approve".into(),
            ));
        }

        self.check_transferable(&token, &token_id, "approve")?;
        Self::check_approval_capacity(&token, &account_id)?;

        let approval_id = self.take_next_approval_id()?;

        let before = self.storage_usage_flushed();
        let mut token = token;
        token
            .approved_account_ids
            .insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        // Storage/accounting invariant: direct approvals charge storage without app context.
        if bytes_used > 0 {
            self.charge_storage_waterfall(&owner_id, bytes_used, None)?;
        }

        crate::fees::refund_excess(&owner_id, env::attached_deposit().as_yoctonear(), 1);

        events::emit_approval_granted(&owner_id, &token_id, &account_id, approval_id);

        if let Some(msg_str) = msg {
            Ok(Some(
                external::ext_scarce_approval_receiver::ext(account_id)
                    .with_static_gas(Gas::from_tgas(DEFAULT_CALLBACK_GAS))
                    .nft_on_approve(token_id, owner_id, approval_id, msg_str),
            ))
        } else {
            Ok(None)
        }
    }

    #[payable]
    #[handle_result]
    pub fn nft_revoke(
        &mut self,
        token_id: String,
        account_id: AccountId,
    ) -> Result<(), MarketplaceError> {
        check_one_yocto()?;

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        let owner_id = env::predecessor_account_id();
        if token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only token owner can revoke approval".into(),
            ));
        }

        let mut token = token.clone();
        let before = self.storage_usage_flushed();
        token.approved_account_ids.remove(&account_id);
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(&owner_id, bytes_freed, None);
        }

        events::emit_approval_revoked(&owner_id, &token_id, &account_id);
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn nft_revoke_all(&mut self, token_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        let owner_id = env::predecessor_account_id();
        if token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only token owner can revoke all approvals".into(),
            ));
        }

        let mut token = token.clone();
        let before = self.storage_usage_flushed();
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(&owner_id, bytes_freed, None);
        }

        events::emit_all_approvals_revoked(&owner_id, &token_id);
        Ok(())
    }

    /// If `approval_id` is supplied, also validates the exact ID.
    pub fn nft_is_approved(
        &self,
        token_id: String,
        approved_account_id: AccountId,
        approval_id: Option<u64>,
    ) -> bool {
        let token = match self.scarces_by_id.get(&token_id) {
            Some(t) => t,
            None => return false,
        };

        token
            .approved_account_ids
            .get(&approved_account_id)
            .is_some_and(|actual| approval_id.is_none_or(|id| *actual == id))
    }
}

impl Contract {
    fn check_approval_capacity(
        token: &Scarce,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        if !token.approved_account_ids.contains_key(account_id)
            && token.approved_account_ids.len() >= MAX_APPROVED_ACCOUNT_IDS_PER_TOKEN
        {
            return Err(MarketplaceError::InvalidInput(format!(
                "Cannot approve more than {} accounts for one token",
                MAX_APPROVED_ACCOUNT_IDS_PER_TOKEN
            )));
        }
        Ok(())
    }

    fn take_next_approval_id(&mut self) -> Result<u64, MarketplaceError> {
        let approval_id = self.next_approval_id;
        if approval_id > MAX_APPROVAL_ID_JSON_SAFE {
            return Err(MarketplaceError::InvalidInput(
                "Approval ID counter exceeds JSON-safe integer range".into(),
            ));
        }
        self.next_approval_id = self.next_approval_id.checked_add(1).ok_or_else(|| {
            MarketplaceError::InternalError("Approval ID counter overflow".into())
        })?;
        Ok(approval_id)
    }

    pub(crate) fn approve(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        account_id: &AccountId,
        msg: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();
        if actor_id != &token.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only owner can approve".into(),
            ));
        }
        self.check_transferable(&token, token_id, "approve")?;
        Self::check_approval_capacity(&token, account_id)?;
        let approval_id = self.take_next_approval_id()?;

        let before = self.storage_usage_flushed();
        token
            .approved_account_ids
            .insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = self.storage_usage_flushed();
        let bytes_used = after.saturating_sub(before);

        if bytes_used > 0 {
            self.charge_storage_waterfall(actor_id, bytes_used, None)?;
        }
        events::emit_approval_granted(actor_id, token_id, account_id, approval_id);
        if let Some(msg_str) = msg {
            let _ = external::ext_scarce_approval_receiver::ext(account_id.clone())
                .with_static_gas(Gas::from_tgas(MAX_RESOLVE_PURCHASE_GAS))
                .nft_on_approve(token_id.to_string(), actor_id.clone(), approval_id, msg_str);
        }
        Ok(())
    }

    pub(crate) fn revoke(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        account_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();
        if actor_id != &token.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only owner can revoke".into(),
            ));
        }
        let before = self.storage_usage_flushed();
        token.approved_account_ids.remove(account_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, None);
        }
        events::emit_approval_revoked(actor_id, token_id, account_id);
        Ok(())
    }

    pub(crate) fn revoke_all(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();
        if actor_id != &token.owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only owner can revoke all".into(),
            ));
        }
        let before = self.storage_usage_flushed();
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = self.storage_usage_flushed();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, None);
        }
        events::emit_all_approvals_revoked(actor_id, token_id);
        Ok(())
    }
}

#[near]
impl Contract {
    /// Security boundary: only `predecessor` is trusted as the NFT contract identity for approval callbacks.
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

        if !self.approved_nft_contracts.contains(&scarce_contract_id) {
            env::log_str(&format!(
                "Marketplace approved for {}.{} by {} (contract not allowlisted — use list_scarce_for_sale to list)",
                scarce_contract_id, token_id, owner_id
            ));
            return Ok(PromiseOrValue::Value("Approval acknowledged".to_string()));
        }

        let price_opt = near_sdk::serde_json::from_str::<near_sdk::serde_json::Value>(&msg)
            .ok()
            .and_then(|v| v.get("sale_conditions")?.as_str()?.parse::<u128>().ok());

        if let Some(price) = price_opt {
            if price == 0 {
                return Err(MarketplaceError::InvalidInput(
                    "Price must be greater than 0".to_string(),
                ));
            }

            let sale_id = Contract::make_sale_id(&scarce_contract_id, &token_id);
            if self.sales.contains_key(&sale_id) {
                env::log_str(&format!(
                    "Sale already exists for {}.{} — use update_price to change",
                    scarce_contract_id, token_id
                ));
                return Ok(PromiseOrValue::Value("Sale already exists".to_string()));
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

            let before = self.storage_usage_flushed();
            self.add_sale(sale);
            let bytes_used = self.storage_usage_flushed().saturating_sub(before);

            self.charge_storage_waterfall(&owner_id, bytes_used, None)?;

            crate::events::emit_scarce_list(
                &owner_id,
                &scarce_contract_id,
                vec![token_id.clone()],
                vec![U128(price)],
            );

            return Ok(PromiseOrValue::Value("Listed successfully".to_string()));
        }

        env::log_str(&format!(
            "Marketplace approved for {}.{} by {}",
            scarce_contract_id, token_id, owner_id
        ));

        Ok(PromiseOrValue::Value("Approval acknowledged".to_string()))
    }
}
