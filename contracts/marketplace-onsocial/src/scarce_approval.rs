// NEP-178 Approval Management

use crate::internal::{check_at_least_one_yocto, check_one_yocto};
use crate::*;

#[near]
impl Contract {
    /// Grant transfer approval to `account_id` for `token_id` (NEP-178).
    /// If `msg` is provided, calls `nft_on_approve` on the approved account.
    /// Excess deposit above 1 yocto is refunded.
    #[payable]
    #[handle_result]
    pub fn nft_approve(
        &mut self,
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
        callback_gas_tgas: Option<u64>,
    ) -> Result<Option<Promise>, MarketplaceError> {
        check_at_least_one_yocto()?;

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        let owner_id = env::predecessor_account_id();
        if token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only token owner can approve".into(),
            ));
        }

        self.check_transferable(token, &token_id, "approve")?;

        let approval_id = self.next_approval_id;
        self.next_approval_id = self.next_approval_id.checked_add(1).ok_or_else(|| {
            MarketplaceError::InternalError("Approval ID counter overflow".into())
        })?;

        let before = env::storage_usage();
        let mut token = token.clone();
        token
            .approved_account_ids
            .insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // No app_id: direct approvals are always Tier-2/3 subsidised.
        if bytes_used > 0 {
            self.charge_storage_waterfall(&owner_id, bytes_used as u64, None)?;
        }

        internal::refund_excess(&owner_id, env::attached_deposit().as_yoctonear(), 1);

        events::emit_approval_granted(&owner_id, &token_id, &account_id, approval_id);

        if let Some(msg_str) = msg {
            // cap caller-supplied gas to prevent scheduling panics
            let callback_gas = Gas::from_tgas(callback_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS).min(MAX_RESOLVE_PURCHASE_GAS));
            Ok(Some(
                external::ext_scarce_approval_receiver::ext(account_id)
                    .with_static_gas(callback_gas)
                    .nft_on_approve(token_id, owner_id, approval_id, msg_str),
            ))
        } else {
            Ok(None)
        }
    }

    /// Revoke transfer approval for `account_id` on `token_id` (NEP-178). Frees storage.
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
        let before = env::storage_usage();
        token.approved_account_ids.remove(&account_id);
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(&owner_id, bytes_freed, None);
        }

        events::emit_approval_revoked(&owner_id, &token_id, &account_id);
        Ok(())
    }

    /// Revoke all transfer approvals for `token_id` (NEP-178). Frees storage.
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
        let before = env::storage_usage();
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.clone(), token);
        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(&owner_id, bytes_freed, None);
        }

        events::emit_all_approvals_revoked(&owner_id, &token_id);
        Ok(())
    }

    /// Returns whether `approved_account_id` holds a valid approval for `token_id`.
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

        match token.approved_account_ids.get(&approved_account_id) {
            Some(actual_approval_id) => {
                if let Some(expected_id) = approval_id {
                    *actual_approval_id == expected_id
                } else {
                    true
                }
            }
            None => false,
        }
    }
}

// --- Internal helpers (execute dispatch) ---

impl Contract {
    /// Approve without deposit or XCC gas override; fires `nft_on_approve` if `msg` is provided.
    pub(crate) fn internal_approve(
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
        let approval_id = self.next_approval_id;
        self.next_approval_id = self.next_approval_id.checked_add(1).ok_or_else(|| {
            MarketplaceError::InternalError("Approval ID counter overflow".into())
        })?;

        let before = env::storage_usage();
        token
            .approved_account_ids
            .insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        if bytes_used > 0 {
            self.charge_storage_waterfall(actor_id, bytes_used as u64, None)?;
        }
        events::emit_approval_granted(actor_id, token_id, account_id, approval_id);
        if let Some(msg_str) = msg {
            let _ = external::ext_scarce_approval_receiver::ext(account_id.clone())
                .with_static_gas(Gas::from_tgas(DEFAULT_CALLBACK_GAS))
                .nft_on_approve(token_id.to_string(), actor_id.clone(), approval_id, msg_str);
        }
        Ok(())
    }

    pub(crate) fn internal_revoke(
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
        let before = env::storage_usage();
        token.approved_account_ids.remove(account_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, None);
        }
        events::emit_approval_revoked(actor_id, token_id, account_id);
        Ok(())
    }

    pub(crate) fn internal_revoke_all(
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
        let before = env::storage_usage();
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = env::storage_usage();
        let bytes_freed = before.saturating_sub(after);
        if bytes_freed > 0 {
            self.release_storage_waterfall(actor_id, bytes_freed, None);
        }
        events::emit_all_approvals_revoked(actor_id, token_id);
        Ok(())
    }
}
