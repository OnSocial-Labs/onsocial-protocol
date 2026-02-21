//! Token ownership index and transferability/app-id resolution helpers.

use crate::*;

impl Contract {
    pub(crate) fn add_token_to_owner(&mut self, owner_id: &AccountId, token_id: &str) {
        if !self.scarces_per_owner.contains_key(owner_id) {
            self.scarces_per_owner.insert(
                owner_id.clone(),
                IterableSet::new(StorageKey::ScarcesPerOwnerInner {
                    account_id_hash: env::sha256(owner_id.as_bytes()),
                }),
            );
        }
        self.scarces_per_owner
            .get_mut(owner_id)
            .unwrap()
            .insert(token_id.to_string());
    }

    pub(crate) fn remove_token_from_owner(&mut self, owner_id: &AccountId, token_id: &str) {
        if let Some(owner_tokens) = self.scarces_per_owner.get_mut(owner_id) {
            owner_tokens.remove(token_id);
            if owner_tokens.is_empty() {
                self.scarces_per_owner.remove(owner_id);
            }
        }
    }

    // Revoked tokens always blocked; token-level flag takes precedence, `None` falls through to collection.
    pub(crate) fn check_transferable(
        &self,
        token: &Scarce,
        token_id: &str,
        action: &str,
    ) -> Result<(), MarketplaceError> {
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(format!(
                "Token is revoked and cannot be used for: {}",
                action
            )));
        }
        match token.transferable {
            Some(false) => Err(MarketplaceError::soulbound(action)),
            Some(true) => Ok(()),
            None => {
                let cid = collection_id_from_token_id(token_id);
                if !cid.is_empty() && self.collections.get(cid).is_some_and(|c| !c.transferable) {
                    return Err(MarketplaceError::soulbound(action));
                }
                Ok(())
            }
        }
    }

    // Standalone tokens carry their own app_id; collection tokens inherit from the collection.
    pub(crate) fn resolve_token_app_id(
        &self,
        token_id: &str,
        token_app_id: Option<&AccountId>,
    ) -> Option<AccountId> {
        token_app_id.cloned().or_else(|| {
            let cid = collection_id_from_token_id(token_id);
            self.collections.get(cid).and_then(|c| c.app_id.clone())
        })
    }
}
