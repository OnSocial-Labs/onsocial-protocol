use near_sdk::{AccountId, PublicKey, env};

use crate::SocialError;
use crate::state::models::SocialPlatform;

/// Nonce prefix: outside account-ID range (0x30+) and LookupMap range (0x00–0x04).
const NONCE_PREFIX: u8 = 0x05;

impl SocialPlatform {
    /// Storage key layout: `0x05 | account | b'/' | public_key_bytes`.
    #[inline]
    pub(crate) fn nonce_storage_key(owner: &AccountId, public_key: &PublicKey) -> Vec<u8> {
        let owner_bytes = owner.as_bytes();
        let pk_bytes = public_key.as_bytes();
        let mut key = Vec::with_capacity(1 + owner_bytes.len() + 1 + pk_bytes.len());
        key.push(NONCE_PREFIX);
        key.extend_from_slice(owner_bytes);
        key.push(b'/');
        key.extend_from_slice(pk_bytes);
        key
    }

    /// Returns the last recorded nonce, or 0 if none exists.
    #[inline]
    pub(crate) fn read_nonce(owner: &AccountId, public_key: &PublicKey) -> u64 {
        let key = Self::nonce_storage_key(owner, public_key);
        env::storage_read(&key)
            .and_then(|bytes| bytes.try_into().ok().map(u64::from_le_bytes))
            .unwrap_or(0)
    }

    /// Writes a raw u64 LE nonce directly to storage.
    #[inline]
    pub(crate) fn write_nonce(owner: &AccountId, public_key: &PublicKey, nonce: u64) {
        let key = Self::nonce_storage_key(owner, public_key);
        env::storage_write(&key, &nonce.to_le_bytes());
    }

    /// Rejects if `nonce` is not strictly greater than the last recorded value.
    pub(crate) fn assert_nonce_fresh(
        owner: &AccountId,
        public_key: &PublicKey,
        nonce: u64,
    ) -> Result<(), SocialError> {
        let last = Self::read_nonce(owner, public_key);
        if nonce <= last {
            return Err(crate::invalid_input!("Nonce too low"));
        }
        Ok(())
    }

    /// Records a nonce after a successful action. Returns new storage bytes consumed.
    pub(crate) fn record_nonce(owner: &AccountId, public_key: &PublicKey, nonce: u64) -> u64 {
        let before = env::storage_usage();
        Self::write_nonce(owner, public_key, nonce);
        env::storage_usage().saturating_sub(before)
    }
}
