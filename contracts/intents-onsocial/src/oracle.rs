//! Oracle attestation verification for intents-onsocial.

use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::{self, Map, Value, json};
use near_sdk::{AccountId, CurveType, PublicKey, env};
use near_sdk_macros::NearSchema;

/// Oracle-signed attestation envelope.
#[derive(NearSchema, serde::Serialize, serde::Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct OracleAuth {
    pub public_key: PublicKey,
    pub nonce: U64,
    pub expires_at_ms: U64,
    pub signature: Base64VecU8,
}

/// Verified oracle nonce tuple.
pub struct OracleContext {
    /// `(current_account_id, oracle_pk, nonce)` to record after dispatch.
    pub signed_nonce: (AccountId, PublicKey, u64),
}

/// Verifies an allowlisted oracle signature and returns the nonce tuple.
pub fn authenticate_oracle(
    att: &OracleAuth,
    action_json: &Value,
    nonce_prefix: u8,
    oracle_pks: &[PublicKey],
    domain_prefix_base: &str,
) -> Result<OracleContext, AuthError> {
    if !oracle_pks.iter().any(|pk| pk == &att.public_key) {
        return Err(AuthError::Unauthorized(
            "oracle_pk".into(),
            String::from(&att.public_key),
        ));
    }

    let contract_id = env::current_account_id();
    let domain_prefix = format!("{domain_prefix_base}:oracle:v1");
    verify_signature(VerifyParams {
        domain_prefix: &domain_prefix,
        target_account: &contract_id,
        public_key: &att.public_key,
        nonce: att.nonce.0,
        expires_at_ms: att.expires_at_ms.0,
        signature: &att.signature.0,
        action: action_json,
    })?;
    nonce::assert_fresh(nonce_prefix, &contract_id, &att.public_key, att.nonce.0)?;

    Ok(OracleContext {
        signed_nonce: (contract_id, att.public_key.clone(), att.nonce.0),
    })
}

struct VerifyParams<'a> {
    domain_prefix: &'a str,
    target_account: &'a AccountId,
    public_key: &'a PublicKey,
    nonce: u64,
    expires_at_ms: u64,
    signature: &'a [u8],
    action: &'a Value,
}

fn verify_signature(params: VerifyParams<'_>) -> Result<(), AuthError> {
    let now_ms = env::block_timestamp_ms();
    if params.expires_at_ms != 0 && now_ms > params.expires_at_ms {
        return Err(AuthError::PayloadExpired);
    }

    if params.public_key.curve_type() != CurveType::ED25519 {
        return Err(AuthError::InvalidInput(
            "Only ed25519 public keys are supported".into(),
        ));
    }
    let pk_bytes = ed25519_public_key_bytes(params.public_key.as_bytes())?;
    let sig_bytes = ed25519_signature_bytes(params.signature)?;

    let pk_str = String::from(params.public_key);
    let contract_id = env::current_account_id();
    let payload = build_signing_payload(
        params.target_account.as_str(),
        &pk_str,
        params.nonce,
        params.expires_at_ms,
        params.action,
    );
    let message =
        build_signing_message(params.domain_prefix, contract_id.as_str(), &payload);

    let message_hash = env::sha256_array(&message);
    if !env::ed25519_verify(&sig_bytes, message_hash, &pk_bytes) {
        return Err(AuthError::SignatureInvalid);
    }

    Ok(())
}

pub mod nonce {
    use near_sdk::{AccountId, PublicKey, env};

    use super::AuthError;

    #[inline]
    fn storage_key(prefix: u8, owner: &AccountId, public_key: &PublicKey) -> Vec<u8> {
        let owner_bytes = owner.as_bytes();
        let pk_bytes = public_key.as_bytes();
        let mut key = Vec::with_capacity(1 + owner_bytes.len() + 1 + pk_bytes.len());
        key.push(prefix);
        key.extend_from_slice(owner_bytes);
        key.push(b'/');
        key.extend_from_slice(pk_bytes);
        key
    }

    #[inline]
    fn read(prefix: u8, owner: &AccountId, public_key: &PublicKey) -> u64 {
        let key = storage_key(prefix, owner, public_key);
        env::storage_read(&key)
            .and_then(|bytes| bytes.try_into().ok().map(u64::from_le_bytes))
            .unwrap_or(0)
    }

    #[inline]
    fn write(prefix: u8, owner: &AccountId, public_key: &PublicKey, nonce: u64) {
        let key = storage_key(prefix, owner, public_key);
        env::storage_write(&key, &nonce.to_le_bytes());
    }

    /// Rejects non-monotonic nonces.
    pub(super) fn assert_fresh(
        prefix: u8,
        owner: &AccountId,
        public_key: &PublicKey,
        nonce: u64,
    ) -> Result<(), AuthError> {
        if nonce <= read(prefix, owner, public_key) {
            return Err(AuthError::NonceStale);
        }
        Ok(())
    }

    /// Stores the last accepted nonce.
    pub fn record(prefix: u8, owner: &AccountId, public_key: &PublicKey, nonce: u64) -> u64 {
        let before = env::storage_usage();
        write(prefix, owner, public_key, nonce);
        env::storage_usage().saturating_sub(before)
    }
}

#[derive(Debug, Clone)]
pub enum AuthError {
    InvalidInput(String),
    Unauthorized(String, String),
    SignatureInvalid,
    NonceStale,
    PayloadExpired,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::InvalidInput(msg) => write!(f, "invalid input: {msg}"),
            Self::Unauthorized(op, acc) => write!(f, "Unauthorized: {op} by {acc}"),
            Self::SignatureInvalid => write!(f, "invalid ed25519 signature"),
            Self::NonceStale => write!(f, "nonce too low"),
            Self::PayloadExpired => write!(f, "signed payload expired"),
        }
    }
}

impl std::error::Error for AuthError {}

/// Accepts raw 32-byte keys or 33-byte tagged keys.
fn ed25519_public_key_bytes(pk_raw: &[u8]) -> Result<[u8; 32], AuthError> {
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

fn ed25519_signature_bytes(signature: &[u8]) -> Result<[u8; 64], AuthError> {
    signature
        .try_into()
        .map_err(|_| AuthError::InvalidInput("Invalid ed25519 signature bytes".into()))
}

/// Recursively sorts object keys for deterministic signing.
fn canonicalize_json_value(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<&String> = map.keys().collect();
            keys.sort();
            let mut out = Map::new();
            for key in keys {
                if let Some(v) = map.get(key) {
                    out.insert(key.clone(), canonicalize_json_value(v));
                }
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_json_value).collect()),
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => value.clone(),
    }
}

fn build_signing_payload(
    target_account: &str,
    public_key_str: &str,
    nonce: u64,
    expires_at_ms: u64,
    action: &Value,
) -> Value {
    json!({
        "target_account": target_account,
        "public_key": public_key_str,
        "nonce": nonce.to_string(),
        "expires_at_ms": expires_at_ms.to_string(),
        "action": canonicalize_json_value(action),
        "delegate_action": Option::<Value>::None,
    })
}

fn build_signing_message(domain_prefix: &str, contract_id: &str, payload: &Value) -> Vec<u8> {
    let domain = format!("{domain_prefix}:{contract_id}");
    let payload_bytes =
        serde_json::to_vec(payload).expect("JSON serialization cannot fail for valid Value");
    let mut message = domain.into_bytes();
    message.reserve_exact(1 + payload_bytes.len());
    message.push(0);
    message.extend_from_slice(&payload_bytes);
    message
}
