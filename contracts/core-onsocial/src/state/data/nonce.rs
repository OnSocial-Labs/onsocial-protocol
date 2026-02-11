use near_sdk::{AccountId, PublicKey};

use crate::state::models::SocialPlatform;

/// Storage prefix 0x05: outside account-ID (0x30+) and LookupMap (0x00–0x04) ranges.
pub(crate) const NONCE_PREFIX: u8 = 0x05;

impl SocialPlatform {
    #[inline]
    pub(crate) fn read_nonce(owner: &AccountId, public_key: &PublicKey) -> u64 {
        onsocial_auth::nonce::read_nonce(NONCE_PREFIX, owner, public_key)
    }

    pub(crate) fn record_nonce(owner: &AccountId, public_key: &PublicKey, nonce: u64) -> u64 {
        onsocial_auth::nonce::record_nonce(NONCE_PREFIX, owner, public_key, nonce)
    }
}
