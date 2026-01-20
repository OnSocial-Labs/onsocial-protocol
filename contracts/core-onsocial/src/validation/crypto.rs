use near_sdk::{CurveType, PublicKey};

use crate::{SocialError, invalid_input};

pub fn ed25519_public_key_bytes(public_key: &PublicKey) -> Result<[u8; 32], SocialError> {
    if public_key.curve_type() != CurveType::ED25519 {
        return Err(invalid_input!("Only ed25519 public keys are supported"));
    }

    let pk_raw = public_key.as_bytes();
    match pk_raw.len() {
        32 => pk_raw
            .try_into()
            .map_err(|_| invalid_input!("Invalid ed25519 public key bytes")),
        33 => pk_raw
            .get(1..)
            .ok_or_else(|| invalid_input!("Invalid ed25519 public key bytes"))?
            .try_into()
            .map_err(|_| invalid_input!("Invalid ed25519 public key bytes")),
        _ => Err(invalid_input!("Invalid ed25519 public key bytes")),
    }
}

pub fn ed25519_signature_bytes(signature: &[u8]) -> Result<[u8; 64], SocialError> {
    signature
        .try_into()
        .map_err(|_| invalid_input!("Invalid ed25519 signature bytes"))
}
