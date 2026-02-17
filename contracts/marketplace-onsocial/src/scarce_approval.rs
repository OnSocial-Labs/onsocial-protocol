// NEP-178 Approval Management Implementation
// Allows marketplace to transfer Scarces on behalf of owners

use crate::internal::{check_at_least_one_yocto, check_one_yocto};
use crate::*;

#[near]
impl Contract {
    /// Approve an account to transfer a specific token (NEP-178)
    /// Optional gas override for callback
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
            return Err(MarketplaceError::Unauthorized("Only token owner can approve".into()));
        }

        // Generate new approval ID
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;

        // Measure storage before/after for byte-accurate charging
        let before = env::storage_usage();

        // Clone token, add approval, and save
        let mut token = token.clone();
        token
            .approved_account_ids
            .insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.clone(), token);

        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Charge storage via waterfall (no app_id for direct approvals)
        if bytes_used > 0 {
            self.charge_storage_waterfall(&owner_id, bytes_used as u64, None)?;
        }

        events::emit_approval_granted(&owner_id, &token_id, &account_id, approval_id);

        // If msg provided, call nft_on_approve on approved account (NEP-178)
        if let Some(msg_str) = msg {
            // Use provided gas or sensible default (50 TGas)
            let callback_gas = Gas::from_tgas(callback_gas_tgas.unwrap_or(DEFAULT_CALLBACK_GAS));

            // Make cross-contract call to approved account
            Ok(Some(
                external::ext_scarce_approval_receiver::ext(account_id)
                    .with_static_gas(callback_gas)
                    .nft_on_approve(token_id, owner_id, approval_id, msg_str),
            ))
        } else {
            Ok(None)
        }
    }

    /// Revoke approval for specific account (NEP-178)
    #[payable]
    #[handle_result]
    pub fn nft_revoke(&mut self, token_id: String, account_id: AccountId) -> Result<(), MarketplaceError> {
        check_one_yocto()?;

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;

        let owner_id = env::predecessor_account_id();
        if token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized("Only token owner can revoke approval".into()));
        }

        let mut token = token.clone();
        token.approved_account_ids.remove(&account_id);
        self.scarces_by_id.insert(token_id.clone(), token);

        events::emit_approval_revoked(&owner_id, &token_id, &account_id);
        Ok(())
    }

    /// Revoke all approvals for a token (NEP-178)
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
            return Err(MarketplaceError::Unauthorized("Only token owner can revoke all approvals".into()));
        }

        let mut token = token.clone();
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.clone(), token);

        events::emit_all_approvals_revoked(&owner_id, &token_id);
        Ok(())
    }

    /// Check if account is approved (NEP-178)
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

// ── Approval management helpers (moved from lib.rs) ──────────────────────────

impl Contract {
    /// Internal approve (used by execute dispatch)
    pub(crate) fn internal_approve(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
        account_id: &AccountId,
        _msg: Option<String>,
    ) -> Result<(), MarketplaceError> {
        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();
        if actor_id != &token.owner_id {
            return Err(MarketplaceError::Unauthorized("Only owner can approve".into()));
        }
        let approval_id = self.next_approval_id;
        self.next_approval_id += 1;

        let before = env::storage_usage();
        token.approved_account_ids.insert(account_id.clone(), approval_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        if bytes_used > 0 {
            self.charge_storage_waterfall(actor_id, bytes_used as u64, None)?;
        }
        events::emit_approval_granted(actor_id, token_id, account_id, approval_id);
        Ok(())
    }

    /// Internal revoke (used by execute dispatch)
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
            return Err(MarketplaceError::Unauthorized("Only owner can revoke".into()));
        }
        token.approved_account_ids.remove(account_id);
        self.scarces_by_id.insert(token_id.to_string(), token);
        events::emit_approval_revoked(actor_id, token_id, account_id);
        Ok(())
    }

    /// Internal revoke all (used by execute dispatch)
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
            return Err(MarketplaceError::Unauthorized("Only owner can revoke all".into()));
        }
        token.approved_account_ids.clear();
        self.scarces_by_id.insert(token_id.to_string(), token);
        events::emit_all_approvals_revoked(actor_id, token_id);
        Ok(())
    }
}
