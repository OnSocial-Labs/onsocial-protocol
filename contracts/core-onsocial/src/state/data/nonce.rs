use near_sdk::{AccountId, PublicKey};

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    #[inline]
    pub(super) fn signed_payload_nonce_storage_key(owner: &AccountId, public_key: &PublicKey) -> String {
        // Account-scoped replay protection.
        format!(
            "{}/signed_payload_nonces/{}",
            owner.as_str(),
            String::from(public_key)
        )
    }

    #[inline]
    pub(super) fn signed_payload_last_nonce(&self, owner: &AccountId, public_key: &PublicKey) -> u64 {
        let k = Self::signed_payload_nonce_storage_key(owner, public_key);
        self.storage_get_string(&k)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0)
    }

    pub(super) fn signed_payload_assert_nonce_fresh(
        &self,
        owner: &AccountId,
        public_key: &PublicKey,
        nonce: u64,
    ) -> Result<(), SocialError> {
        let last = self.signed_payload_last_nonce(owner, public_key);
        if nonce <= last {
            return Err(crate::invalid_input!("Nonce too low"));
        }
        Ok(())
    }

    pub(super) fn signed_payload_record_nonce(
        &mut self,
        owner: &AccountId,
        public_key: &PublicKey,
        nonce: u64,
        attached_balance: &mut u128,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let k = Self::signed_payload_nonce_storage_key(owner, public_key);
        self.storage_write_string(&k, &nonce.to_string(), Some(attached_balance))?;

        crate::events::EventBuilder::new(
            crate::constants::EVENT_TYPE_CONTRACT_UPDATE,
            "signed_payload_nonce_recorded",
            owner.clone(),
        )
        .with_target(owner)
        .with_field("public_key", String::from(public_key))
        .with_field("nonce", nonce.to_string())
        .with_path(&k)
        .with_value(near_sdk::serde_json::Value::String(nonce.to_string()))
        .emit(event_batch);
        Ok(())
    }
}
