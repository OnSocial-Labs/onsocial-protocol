//! Ed25519 byte extraction helpers.

use crate::AuthError;

/// Extract 32 raw ed25519 public key bytes.
/// Accepts 32-byte (raw) or 33-byte (curve-type prefix + key) input.
pub fn ed25519_public_key_bytes(pk_raw: &[u8]) -> Result<[u8; 32], AuthError> {
    match pk_raw.len() {
        32 => pk_raw
            .try_into()
            .map_err(|_| AuthError::InvalidInput("Invalid ed25519 public key bytes".into())),
        33 => pk_raw
            .get(1..)
            .ok_or_else(|| AuthError::InvalidInput("Invalid ed25519 public key bytes".into()))?
            .try_into()
            .map_err(|_| AuthError::InvalidInput("Invalid ed25519 public key bytes".into())),
        _ => Err(AuthError::InvalidInput(
            "Invalid ed25519 public key bytes".into(),
        )),
    }
}

/// Extract 64 raw ed25519 signature bytes.
pub fn ed25519_signature_bytes(signature: &[u8]) -> Result<[u8; 64], AuthError> {
    signature
        .try_into()
        .map_err(|_| AuthError::InvalidInput("Invalid ed25519 signature bytes".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pk_32_bytes() {
        let bytes = [0u8; 32];
        assert!(ed25519_public_key_bytes(&bytes).is_ok());
    }

    #[test]
    fn test_pk_33_bytes_strips_prefix() {
        let mut bytes = [0u8; 33];
        bytes[0] = 0x00;
        bytes[1] = 42;
        let result = ed25519_public_key_bytes(&bytes).unwrap();
        assert_eq!(result[0], 42);
    }

    #[test]
    fn test_pk_wrong_length() {
        assert!(ed25519_public_key_bytes(&[0u8; 31]).is_err());
        assert!(ed25519_public_key_bytes(&[0u8; 34]).is_err());
    }

    #[test]
    fn test_sig_64_bytes() {
        let bytes = [0u8; 64];
        assert!(ed25519_signature_bytes(&bytes).is_ok());
    }

    #[test]
    fn test_sig_wrong_length() {
        assert!(ed25519_signature_bytes(&[0u8; 63]).is_err());
        assert!(ed25519_signature_bytes(&[0u8; 65]).is_err());
    }
}
