//! GCP Cloud KMS Ed25519 signing backend.
//!
//! Signs NEAR transactions via `EC_SIGN_ED25519` keys in Google Cloud KMS.
//! Private keys never leave the HSM.
//!
//! Env: `RELAYER_SIGNER_MODE=kms`, `GCP_KMS_PROJECT`, `GCP_KMS_LOCATION`,
//! `GCP_KMS_KEYRING`, `GOOGLE_APPLICATION_CREDENTIALS`.

#[cfg(feature = "gcp")]
mod inner {
    use base64::{engine::general_purpose::STANDARD as B64, Engine};
    use google_cloud_auth::credentials::{AccessTokenCredentials, Builder};
    use near_crypto::{ED25519PublicKey, PublicKey, Signature};
    use near_primitives::borsh;
    use near_primitives::hash::CryptoHash;
    use near_primitives::transaction::{SignedTransaction, Transaction, TransactionV0};
    use near_primitives::types::{AccountId, Nonce};
    use rand::Rng;
    use serde::{Deserialize, Serialize};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{Duration, Instant};
    use tracing::{debug, info, warn};

    use crate::metrics::METRICS;

    const KMS_REQUEST_TIMEOUT: Duration = Duration::from_secs(10);
    const KMS_CONNECT_TIMEOUT: Duration = Duration::from_secs(5);
    const KMS_MAX_RETRIES: u32 = 3;
    const KMS_RETRY_BASE_MS: u64 = 100;
    /// 3 retries × ~4 concurrent ops = 12, so 15 avoids false triggers.
    const KMS_CIRCUIT_THRESHOLD: u64 = 15;
    const KMS_CIRCUIT_RECOVERY_SECS: u64 = 30;

    /// GCP KMS key reference (project/location/keyring/key/version).
    #[derive(Debug, Clone)]
    pub struct KmsKeyRef {
        pub resource_name: String,
        pub public_key: PublicKey,
        pub account_id: AccountId,
    }

    /// GCP KMS client with circuit breaker and retry logic.
    pub struct KmsClient {
        http: reqwest::Client,
        credentials: AccessTokenCredentials,
        cb_failures: AtomicU64,
        cb_last_failure: AtomicU64,
    }

    // --- KMS REST API types ---

    #[derive(Serialize)]
    struct AsymmetricSignRequest {
        data: String,
    }

    #[derive(Deserialize)]
    struct AsymmetricSignResponse {
        signature: String,
    }

    #[derive(Deserialize)]
    struct GetPublicKeyResponse {
        pem: String,
        algorithm: String,
    }

    /// Transient HTTP errors worth retrying.
    fn is_retryable(status: reqwest::StatusCode) -> bool {
        matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504)
    }

    impl KmsClient {
        /// Create a new KMS client using Application Default Credentials.
        pub fn new() -> Result<Self, crate::Error> {
            let credentials = Builder::default()
                .with_scopes(["https://www.googleapis.com/auth/cloudkms"])
                .build_access_token_credentials()
                .map_err(|e| crate::Error::Config(format!("GCP auth failed: {e}")))?;

            let http = reqwest::Client::builder()
                .timeout(KMS_REQUEST_TIMEOUT)
                .connect_timeout(KMS_CONNECT_TIMEOUT)
                .pool_max_idle_per_host(4)
                .build()
                .map_err(|e| crate::Error::Config(format!("HTTP client build failed: {e}")))?;

            Ok(Self {
                http,
                credentials,
                cb_failures: AtomicU64::new(0),
                cb_last_failure: AtomicU64::new(0),
            })
        }

        pub fn is_circuit_open(&self) -> bool {
            let failures = self.cb_failures.load(Ordering::Relaxed);
            if failures < KMS_CIRCUIT_THRESHOLD {
                return false;
            }
            let last = self.cb_last_failure.load(Ordering::Relaxed);
            let now = now_secs();
            if now - last > KMS_CIRCUIT_RECOVERY_SECS {
                return false; // half-open: retry after recovery window
            }
            true
        }

        /// Record success — resets circuit breaker.
        fn record_success(&self) {
            let prev = self.cb_failures.swap(0, Ordering::Relaxed);
            if prev >= KMS_CIRCUIT_THRESHOLD {
                info!("KMS circuit breaker recovered");
            }
        }

        /// Record failure — may trip circuit breaker.
        fn record_failure(&self) {
            let failures = self.cb_failures.fetch_add(1, Ordering::Relaxed) + 1;
            self.cb_last_failure.store(now_secs(), Ordering::Relaxed);
            if failures == KMS_CIRCUIT_THRESHOLD {
                warn!(
                    failures,
                    "KMS circuit breaker OPEN — signing will fail fast for {}s",
                    KMS_CIRCUIT_RECOVERY_SECS
                );
            }
        }

        /// Check KMS connectivity. Used by /health.
        pub async fn health_check(&self) -> Result<(), crate::Error> {
            if self.is_circuit_open() {
                return Err(crate::Error::Rpc("KMS circuit breaker is open".into()));
            }
            let _token = self.access_token().await?;
            Ok(())
        }

        async fn access_token(&self) -> Result<String, crate::Error> {
            let token = self
                .credentials
                .access_token()
                .await
                .map_err(|e| crate::Error::Config(format!("GCP token error: {e}")))?;
            Ok(token.token)
        }

        /// Retrieve Ed25519 public key from a KMS key version.
        /// Retries on transient errors with exponential backoff.
        pub async fn get_public_key(&self, resource_name: &str) -> Result<PublicKey, crate::Error> {
            let url = format!(
                "https://cloudkms.googleapis.com/v1/{}/publicKey",
                resource_name
            );

            let mut last_err = None;
            for attempt in 0..KMS_MAX_RETRIES {
                if attempt > 0 {
                    let base = KMS_RETRY_BASE_MS * 2u64.pow(attempt);
                    let jitter = rand::thread_rng().gen_range(0..=base / 2);
                    let delay = Duration::from_millis(base + jitter);
                    tokio::time::sleep(delay).await;
                }

                let token = match self.access_token().await {
                    Ok(t) => t,
                    Err(e) => {
                        last_err = Some(e);
                        continue;
                    }
                };

                let response = match self.http.get(&url).bearer_auth(&token).send().await {
                    Ok(r) => r,
                    Err(e) => {
                        warn!(attempt, error = %e, "KMS getPublicKey request failed (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS getPublicKey failed: {e}")));
                        continue;
                    }
                };

                let status = response.status();
                if !status.is_success() {
                    if is_retryable(status) && attempt + 1 < KMS_MAX_RETRIES {
                        warn!(attempt, status = %status, "KMS getPublicKey transient error (retrying)");
                        last_err =
                            Some(crate::Error::Rpc(format!("KMS getPublicKey HTTP {status}")));
                        continue;
                    }
                    return Err(crate::Error::Rpc(format!(
                        "KMS getPublicKey HTTP error: {status}"
                    )));
                }

                let resp: GetPublicKeyResponse = response
                    .json()
                    .await
                    .map_err(|e| crate::Error::Rpc(format!("KMS getPublicKey parse error: {e}")))?;

                if resp.algorithm != "EC_SIGN_ED25519" {
                    return Err(crate::Error::Config(format!(
                        "KMS key is not Ed25519: {}",
                        resp.algorithm
                    )));
                }

                // Parse PEM → raw 32-byte Ed25519 public key (SPKI: 12-byte header + 32-byte key).
                let pem_body: String = resp
                    .pem
                    .lines()
                    .filter(|l| !l.starts_with("-----"))
                    .collect();

                let der = B64
                    .decode(&pem_body)
                    .map_err(|e| crate::Error::Config(format!("KMS PEM decode error: {e}")))?;

                if der.len() != 44 {
                    return Err(crate::Error::Config(format!(
                        "Unexpected SPKI length: {} (expected 44)",
                        der.len()
                    )));
                }

                let raw_key: [u8; 32] = der[12..44].try_into().map_err(|_| {
                    crate::Error::Config("Failed to extract 32-byte Ed25519 key".into())
                })?;

                let ed25519_pk = ED25519PublicKey(raw_key);
                let pk = PublicKey::ED25519(ed25519_pk);

                info!(key = %pk, resource = resource_name, "Retrieved Ed25519 public key from KMS");
                self.record_success();
                return Ok(pk);
            }

            Err(last_err.unwrap_or_else(|| {
                crate::Error::Rpc("KMS getPublicKey failed after retries".into())
            }))
        }

        /// Sign raw bytes via KMS Ed25519 (PureEdDSA). Returns 64-byte signature.
        /// Retries on transient errors; respects circuit breaker.
        pub async fn sign(
            &self,
            resource_name: &str,
            data: &[u8],
        ) -> Result<Signature, crate::Error> {
            let kms_start = Instant::now();

            // Fail fast if KMS is down
            if self.is_circuit_open() {
                METRICS.kms_sign_errors.fetch_add(1, Ordering::Relaxed);
                return Err(crate::Error::Rpc(
                    "KMS circuit breaker open — signing unavailable".into(),
                ));
            }

            let url = format!(
                "https://cloudkms.googleapis.com/v1/{}:asymmetricSign",
                resource_name
            );

            let body = AsymmetricSignRequest {
                data: B64.encode(data),
            };

            let mut last_err = None;
            for attempt in 0..KMS_MAX_RETRIES {
                if attempt > 0 {
                    let base = KMS_RETRY_BASE_MS * 2u64.pow(attempt);
                    let jitter = rand::thread_rng().gen_range(0..=base / 2);
                    let delay = Duration::from_millis(base + jitter);
                    tokio::time::sleep(delay).await;
                }

                let token = match self.access_token().await {
                    Ok(t) => t,
                    Err(e) => {
                        // Only record failure on final attempt to avoid
                        // prematurely tripping the circuit breaker.
                        if attempt + 1 == KMS_MAX_RETRIES {
                            self.record_failure();
                        }
                        last_err = Some(e);
                        continue;
                    }
                };

                let response = match self
                    .http
                    .post(&url)
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(r) => r,
                    Err(e) => {
                        if attempt + 1 == KMS_MAX_RETRIES {
                            self.record_failure();
                        }
                        warn!(attempt, error = %e, "KMS sign request failed (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS sign failed: {e}")));
                        continue;
                    }
                };

                let status = response.status();
                if !status.is_success() {
                    if is_retryable(status) && attempt + 1 < KMS_MAX_RETRIES {
                        warn!(attempt, status = %status, "KMS sign transient error (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS sign HTTP {status}")));
                        continue;
                    }
                    self.record_failure();
                    return Err(crate::Error::Rpc(format!("KMS sign HTTP error: {status}")));
                }

                let resp: AsymmetricSignResponse = response
                    .json()
                    .await
                    .map_err(|e| crate::Error::Rpc(format!("KMS sign parse error: {e}")))?;

                let sig_bytes = B64
                    .decode(&resp.signature)
                    .map_err(|e| crate::Error::Rpc(format!("KMS signature decode error: {e}")))?;

                if sig_bytes.len() != 64 {
                    return Err(crate::Error::Rpc(format!(
                        "KMS returned {}-byte signature (expected 64)",
                        sig_bytes.len()
                    )));
                }

                let mut sig_array = [0u8; 64];
                sig_array.copy_from_slice(&sig_bytes);

                debug!(
                    resource = resource_name,
                    attempt, "KMS Ed25519 signature obtained"
                );

                self.record_success();
                METRICS.record_kms_sign_duration(kms_start);
                return Ok(Signature::ED25519(ed25519_dalek::Signature::from_bytes(
                    &sig_array,
                )));
            }

            METRICS.kms_sign_errors.fetch_add(1, Ordering::Relaxed);
            Err(last_err
                .unwrap_or_else(|| crate::Error::Rpc("KMS sign failed after retries".into())))
        }

        /// Sign a NEAR transaction via KMS.
        /// Manually serializes → hashes → signs → assembles SignedTransaction
        /// (bypasses `Transaction::sign()` which requires a local `Signer`).
        pub async fn sign_transaction(
            &self,
            key_ref: &KmsKeyRef,
            nonce: Nonce,
            receiver_id: &AccountId,
            block_hash: CryptoHash,
            actions: Vec<near_primitives::transaction::Action>,
        ) -> Result<SignedTransaction, crate::Error> {
            let tx = Transaction::V0(TransactionV0 {
                signer_id: key_ref.account_id.clone(),
                public_key: key_ref.public_key.clone(),
                nonce,
                receiver_id: receiver_id.clone(),
                block_hash,
                actions,
            });

            let tx_bytes = borsh::to_vec(&tx)
                .map_err(|e| crate::Error::Rpc(format!("TX serialization failed: {e}")))?;

            let tx_hash = CryptoHash::hash_bytes(&tx_bytes);

            let signature = self.sign(&key_ref.resource_name, tx_hash.as_ref()).await?;

            Ok(SignedTransaction::new(signature, tx))
        }

        /// Build a KMS key resource name from components.
        pub fn resource_name(
            project: &str,
            location: &str,
            keyring: &str,
            key: &str,
            version: u32,
        ) -> String {
            format!(
                "projects/{project}/locations/{location}/keyRings/{keyring}/cryptoKeys/{key}/cryptoKeyVersions/{version}"
            )
        }

        /// Fetch public key from KMS and associate with a NEAR account.
        pub async fn init_key_ref(
            &self,
            project: &str,
            location: &str,
            keyring: &str,
            key_name: &str,
            version: u32,
            account_id: &AccountId,
        ) -> Result<KmsKeyRef, crate::Error> {
            let resource_name = Self::resource_name(project, location, keyring, key_name, version);
            let public_key = self.get_public_key(&resource_name).await?;

            Ok(KmsKeyRef {
                resource_name,
                public_key,
                account_id: account_id.clone(),
            })
        }

        /// Create a new Ed25519 key in KMS and return a ready [`KmsKeyRef`].
        /// Handles 409 (already exists) idempotently. Retries on transient errors.
        pub async fn create_key(
            &self,
            project: &str,
            location: &str,
            keyring: &str,
            key_id: &str,
            account_id: &AccountId,
        ) -> Result<KmsKeyRef, crate::Error> {
            if self.is_circuit_open() {
                return Err(crate::Error::Rpc(
                    "KMS circuit breaker open — cannot create key".into(),
                ));
            }

            let parent = format!("projects/{project}/locations/{location}/keyRings/{keyring}");
            let url = format!(
                "https://cloudkms.googleapis.com/v1/{parent}/cryptoKeys?cryptoKeyId={key_id}"
            );

            let body = serde_json::json!({
                "purpose": "ASYMMETRIC_SIGN",
                "versionTemplate": {
                    "algorithm": "EC_SIGN_ED25519"
                }
            });

            let mut last_err = None;
            for attempt in 0..KMS_MAX_RETRIES {
                if attempt > 0 {
                    let delay = Duration::from_millis(KMS_RETRY_BASE_MS * 2u64.pow(attempt));
                    tokio::time::sleep(delay).await;
                }

                let token = match self.access_token().await {
                    Ok(t) => t,
                    Err(e) => {
                        self.record_failure();
                        last_err = Some(e);
                        continue;
                    }
                };

                let response = match self
                    .http
                    .post(&url)
                    .bearer_auth(&token)
                    .json(&body)
                    .send()
                    .await
                {
                    Ok(r) => r,
                    Err(e) => {
                        self.record_failure();
                        warn!(attempt, key_id, error = %e, "KMS createKey request failed (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS createKey failed: {e}")));
                        continue;
                    }
                };

                let status = response.status();
                if status == reqwest::StatusCode::CONFLICT {
                    // Key already exists — idempotent
                    info!(key_id, "KMS key already exists, fetching public key");
                    self.record_success();
                    return self
                        .init_key_ref(project, location, keyring, key_id, 1, account_id)
                        .await;
                }

                if !status.is_success() {
                    self.record_failure();
                    if is_retryable(status) && attempt + 1 < KMS_MAX_RETRIES {
                        warn!(attempt, key_id, status = %status, "KMS createKey transient error (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS createKey HTTP {status}")));
                        continue;
                    }
                    let body_text = response.text().await.unwrap_or_default();
                    return Err(crate::Error::Rpc(format!(
                        "KMS createKey HTTP {status}: {body_text}"
                    )));
                }

                // Version 1 is auto-provisioned on creation.
                self.record_success();
                info!(key_id, "Created new KMS Ed25519 key");

                // Fetch the public key from the newly created version 1
                return self
                    .init_key_ref(project, location, keyring, key_id, 1, account_id)
                    .await;
            }

            Err(last_err
                .unwrap_or_else(|| crate::Error::Rpc("KMS createKey failed after retries".into())))
        }
    }

    fn now_secs() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    }
}

#[cfg(feature = "gcp")]
pub use inner::*;
