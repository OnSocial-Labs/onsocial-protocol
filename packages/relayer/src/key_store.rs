//! Encrypted key persistence (AES-256-GCM) for crash recovery.

use near_primitives::types::AccountId;
use std::path::PathBuf;
use tracing::info;

/// Key store: encrypted (AES-256-GCM) for production, plaintext for dev.
pub struct KeyStore {
    path: PathBuf,
    encryption_key: Option<[u8; 32]>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredKeys {
    account_id: String,
    keys: Vec<StoredKey>,
}

#[derive(serde::Serialize, serde::Deserialize)]
struct StoredKey {
    public_key: String,
    secret_key: String,
}

impl KeyStore {
    pub fn new_plaintext(path: PathBuf) -> Self {
        Self {
            path,
            encryption_key: None,
        }
    }

    pub fn new_encrypted(path: PathBuf, key_b64: &str) -> Result<Self, crate::Error> {
        let key_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, key_b64)
            .map_err(|e| crate::Error::Config(format!("Invalid encryption key base64: {e}")))?;

        if key_bytes.len() != 32 {
            return Err(crate::Error::Config(format!(
                "Encryption key must be 32 bytes, got {}",
                key_bytes.len()
            )));
        }

        let mut key = [0u8; 32];
        key.copy_from_slice(&key_bytes);

        Ok(Self {
            path,
            encryption_key: Some(key),
        })
    }

    pub fn save(
        &self,
        account_id: &AccountId,
        keys: &[(String, String)],
    ) -> Result<(), crate::Error> {
        let stored = StoredKeys {
            account_id: account_id.to_string(),
            keys: keys
                .iter()
                .map(|(pk, sk)| StoredKey {
                    public_key: pk.clone(),
                    secret_key: sk.clone(),
                })
                .collect(),
        };

        let json = serde_json::to_string_pretty(&stored)
            .map_err(|e| crate::Error::Config(format!("Failed to serialize keys: {e}")))?;

        let data = if let Some(key) = &self.encryption_key {
            encrypt_aes256gcm(key, json.as_bytes())?
        } else {
            json.into_bytes()
        };

        // Atomic write: tmp + rename
        let tmp = self.path.with_extension("tmp");
        // Ensure parent directory exists
        if let Some(parent) = tmp.parent() {
            std::fs::create_dir_all(parent).map_err(|e| {
                crate::Error::Config(format!("Failed to create key store directory: {e}"))
            })?;
        }
        std::fs::write(&tmp, &data)
            .map_err(|e| crate::Error::Config(format!("Failed to write key store: {e}")))?;
        std::fs::rename(&tmp, &self.path)
            .map_err(|e| crate::Error::Config(format!("Failed to rename key store: {e}")))?;

        info!(path = %self.path.display(), count = keys.len(), "Key store saved");
        Ok(())
    }

    pub fn load(&self) -> Result<Vec<(String, String)>, crate::Error> {
        if !self.path.exists() {
            info!(path = %self.path.display(), "No key store found, starting fresh");
            return Ok(vec![]);
        }

        let data = std::fs::read(&self.path)
            .map_err(|e| crate::Error::Config(format!("Failed to read key store: {e}")))?;

        let json_bytes = if let Some(key) = &self.encryption_key {
            decrypt_aes256gcm(key, &data)?
        } else {
            data
        };

        let stored: StoredKeys = serde_json::from_slice(&json_bytes)
            .map_err(|e| crate::Error::Config(format!("Failed to parse key store: {e}")))?;

        info!(path = %self.path.display(), count = stored.keys.len(), "Key store loaded");

        Ok(stored
            .keys
            .into_iter()
            .map(|k| (k.public_key, k.secret_key))
            .collect())
    }
}

fn encrypt_aes256gcm(key: &[u8; 32], plaintext: &[u8]) -> Result<Vec<u8>, crate::Error> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| crate::Error::Config(format!("AES init failed: {e}")))?;

    // Generate random 12-byte nonce
    let mut nonce_bytes = [0u8; 12];
    use rand::RngCore;
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|e| crate::Error::Config(format!("Encryption failed: {e}")))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);
    Ok(result)
}

fn decrypt_aes256gcm(key: &[u8; 32], data: &[u8]) -> Result<Vec<u8>, crate::Error> {
    use aes_gcm::aead::{Aead, KeyInit};
    use aes_gcm::{Aes256Gcm, Nonce};

    if data.len() < 12 {
        return Err(crate::Error::Config(
            "Encrypted data too short (missing nonce)".into(),
        ));
    }

    let (nonce_bytes, ciphertext) = data.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);

    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|e| crate::Error::Config(format!("AES init failed: {e}")))?;

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| crate::Error::Config(format!("Decryption failed (wrong key?): {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let key = [42u8; 32];
        let plaintext = b"hello world, these are secret keys!";
        let encrypted = encrypt_aes256gcm(&key, plaintext).unwrap();
        let decrypted = decrypt_aes256gcm(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_wrong_key_fails() {
        let key1 = [42u8; 32];
        let key2 = [99u8; 32];
        let plaintext = b"secret data";
        let encrypted = encrypt_aes256gcm(&key1, plaintext).unwrap();
        assert!(decrypt_aes256gcm(&key2, &encrypted).is_err());
    }

    #[test]
    fn test_plaintext_store_roundtrip() {
        let dir = std::env::temp_dir().join("test_keystore_plain");
        let store = KeyStore::new_plaintext(dir.clone());
        let account: AccountId = "test.testnet".parse().unwrap();
        let keys = vec![
            ("ed25519:abc".to_string(), "ed25519:secret1".to_string()),
            ("ed25519:def".to_string(), "ed25519:secret2".to_string()),
        ];
        store.save(&account, &keys).unwrap();
        let loaded = store.load().unwrap();
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].0, "ed25519:abc");
        // Cleanup
        let _ = std::fs::remove_file(&dir);
    }
}
