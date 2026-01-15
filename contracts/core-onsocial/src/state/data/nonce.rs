use near_sdk::{AccountId, PublicKey};

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    #[inline]
    fn signed_payload_nonce_storage_key(owner: &AccountId, public_key: &PublicKey) -> String {
        // Account-scoped replay protection.
        format!(
            "{}/signed_payload_nonces/{}",
            owner.as_str(),
            String::from(public_key)
        )
    }

    pub(crate) fn signed_payload_record_nonce(
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
        .emit(event_batch);
        Ok(())
    }
}
