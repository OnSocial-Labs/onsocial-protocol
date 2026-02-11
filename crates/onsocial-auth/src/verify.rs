//! Ed25519 signature verification using NEAR host functions.

use near_sdk::{AccountId, CurveType, PublicKey, env};
use onsocial_types::AuthError;
use serde_json::Value;

pub struct Verify<'a> {
    pub domain_prefix: &'a str,
    pub target_account: &'a AccountId,
    pub public_key: &'a PublicKey,
    pub nonce: u64,
    /// Expiry in ms. 0 = no expiry.
    pub expires_at_ms: u64,
    pub signature: &'a [u8],
    pub action: &'a Value,
    pub delegate_action: Option<&'a Value>,
}

/// Verify an ed25519 signed payload.
/// Uses `env::current_account_id()` for domain separation (cross-contract replay prevention).
pub fn verify_signature(params: &Verify<'_>) -> Result<(), AuthError> {
    let now_ms = env::block_timestamp_ms();
    if params.expires_at_ms != 0 && now_ms > params.expires_at_ms {
        return Err(AuthError::PayloadExpired);
    }

    if params.public_key.curve_type() != CurveType::ED25519 {
        return Err(AuthError::InvalidInput(
            "Only ed25519 public keys are supported".into(),
        ));
    }
    let pk_bytes = onsocial_types::ed25519_public_key_bytes(params.public_key.as_bytes())?;
    let sig_bytes = onsocial_types::ed25519_signature_bytes(params.signature)?;

    let pk_str = String::from(params.public_key);
    let contract_id = env::current_account_id();
    let payload = onsocial_types::build_signing_payload(
        params.target_account.as_str(),
        &pk_str,
        params.nonce,
        params.expires_at_ms,
        params.action,
        params.delegate_action,
    );
    let message =
        onsocial_types::build_signing_message(params.domain_prefix, contract_id.as_str(), &payload);

    let message_hash = env::sha256_array(&message);
    if !env::ed25519_verify(&sig_bytes, message_hash, &pk_bytes) {
        return Err(AuthError::SignatureInvalid);
    }

    Ok(())
}
