//! Signing message construction for the OnSocial signature scheme.

use serde_json::{Value, json};

use crate::canonicalize_json_value;

/// Build the payload JSON with canonical key order.
/// Requires `serde_json` `preserve_order` feature for deterministic field order.
pub fn build_signing_payload(
    target_account: &str,
    public_key_str: &str,
    nonce: u64,
    expires_at_ms: u64,
    action: &Value,
    delegate_action: Option<&Value>,
) -> Value {
    json!({
        "target_account": target_account,
        "public_key": public_key_str,
        "nonce": nonce.to_string(),
        "expires_at_ms": expires_at_ms.to_string(),
        "action": canonicalize_json_value(action),
        "delegate_action": delegate_action.map(canonicalize_json_value),
    })
}

/// Format: `{domain_prefix}:{contract_id}\0{payload_json}`.
pub fn build_signing_message(domain_prefix: &str, contract_id: &str, payload: &Value) -> Vec<u8> {
    let domain = format!("{domain_prefix}:{contract_id}");
    let payload_bytes =
        serde_json::to_vec(payload).expect("JSON serialization cannot fail for valid Value");
    let mut message = domain.into_bytes();
    message.reserve_exact(1 + payload_bytes.len());
    message.push(0);
    message.extend_from_slice(&payload_bytes);
    message
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_payload_key_order() {
        let action = json!({"type": "set", "data": {"k": "v"}});
        let payload = build_signing_payload("alice.testnet", "ed25519:abc", 1, 1000, &action, None);
        let keys: Vec<&String> = payload.as_object().unwrap().keys().collect();
        assert_eq!(
            keys,
            vec![
                "target_account",
                "public_key",
                "nonce",
                "expires_at_ms",
                "action",
                "delegate_action"
            ]
        );
    }

    #[test]
    fn test_nonce_serialized_as_string() {
        let action = json!({"type": "set"});
        let payload = build_signing_payload("a.testnet", "ed25519:x", 42, 0, &action, None);
        assert_eq!(payload["nonce"], json!("42"));
        assert_eq!(payload["expires_at_ms"], json!("0"));
    }

    #[test]
    fn test_message_format() {
        let payload = json!({"test": true});
        let message = build_signing_message("onsocial:execute:v1", "core.testnet", &payload);
        let domain = b"onsocial:execute:v1:core.testnet";
        assert_eq!(&message[..domain.len()], domain);
        assert_eq!(message[domain.len()], 0);
        let payload_bytes = serde_json::to_vec(&payload).unwrap();
        assert_eq!(&message[domain.len() + 1..], &payload_bytes[..]);
    }
}
