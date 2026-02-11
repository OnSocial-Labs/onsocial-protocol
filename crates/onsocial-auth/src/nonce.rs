//! Per-(account, public_key) nonce management via NEAR storage.
//! Each contract chooses a unique `prefix` byte to avoid key collisions.

use near_sdk::{AccountId, PublicKey, env};
use onsocial_types::AuthError;

/// Key format: `prefix | account | '/' | public_key_bytes`.
#[inline]
pub fn nonce_storage_key(prefix: u8, owner: &AccountId, public_key: &PublicKey) -> Vec<u8> {
    let owner_bytes = owner.as_bytes();
    let pk_bytes = public_key.as_bytes();
    let mut key = Vec::with_capacity(1 + owner_bytes.len() + 1 + pk_bytes.len());
    key.push(prefix);
    key.extend_from_slice(owner_bytes);
    key.push(b'/');
    key.extend_from_slice(pk_bytes);
    key
}

/// Read the last recorded nonce, or 0 if none.
#[inline]
pub fn read_nonce(prefix: u8, owner: &AccountId, public_key: &PublicKey) -> u64 {
    let key = nonce_storage_key(prefix, owner, public_key);
    env::storage_read(&key)
        .and_then(|bytes| bytes.try_into().ok().map(u64::from_le_bytes))
        .unwrap_or(0)
}

#[inline]
pub fn write_nonce(prefix: u8, owner: &AccountId, public_key: &PublicKey, nonce: u64) {
    let key = nonce_storage_key(prefix, owner, public_key);
    env::storage_write(&key, &nonce.to_le_bytes());
}

/// Returns `NonceStale` if `nonce` <= last recorded value.
pub fn assert_nonce_fresh(
    prefix: u8,
    owner: &AccountId,
    public_key: &PublicKey,
    nonce: u64,
) -> Result<(), AuthError> {
    let last = read_nonce(prefix, owner, public_key);
    if nonce <= last {
        return Err(AuthError::NonceStale);
    }
    Ok(())
}

/// Write nonce and return new storage bytes consumed (0 if overwrite).
pub fn record_nonce(prefix: u8, owner: &AccountId, public_key: &PublicKey, nonce: u64) -> u64 {
    let before = env::storage_usage();
    write_nonce(prefix, owner, public_key, nonce);
    env::storage_usage().saturating_sub(before)
}
