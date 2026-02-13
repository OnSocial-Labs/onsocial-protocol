//! GCP Cloud KMS Ed25519 signing backend.
//!
//! Signs NEAR transactions via `EC_SIGN_ED25519` keys stored in Cloud KMS HSMs.
//! Requires env: `RELAYER_SIGNER_MODE=kms`, `GCP_KMS_PROJECT`,
//! `GCP_KMS_LOCATION`, `GCP_KMS_KEYRING`, `GOOGLE_APPLICATION_CREDENTIALS`.

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
    /// Threshold: 3 retries × ~4 concurrent ops = 12, so 15 avoids false triggers.
    const KMS_CIRCUIT_THRESHOLD: u64 = 15;
    /// Half-open recovery window.
    const KMS_CIRCUIT_RECOVERY_SECS: u64 = 30;

    /// Fully-qualified KMS key version bound to a NEAR account.
    #[derive(Debug, Clone)]
    pub struct KmsKeyRef {
        pub resource_name: String,
        pub public_key: PublicKey,
        pub account_id: AccountId,
    }

    /// GCP Cloud KMS client with independent circuit breakers for signing and
    /// management (key creation/retrieval). Management failures never block signing.
    pub struct KmsClient {
        http: reqwest::Client,
        credentials: AccessTokenCredentials,
        // --- Sign circuit breaker ---
        cb_sign_failures: AtomicU64,
        cb_sign_last_failure: AtomicU64,
        // --- Management circuit breaker ---
        cb_mgmt_failures: AtomicU64,
        cb_mgmt_last_failure: AtomicU64,
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

    fn is_retryable(status: reqwest::StatusCode) -> bool {
        matches!(status.as_u16(), 408 | 429 | 500 | 502 | 503 | 504)
    }

    impl KmsClient {
        /// Initialize with Application Default Credentials.
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
                cb_sign_failures: AtomicU64::new(0),
                cb_sign_last_failure: AtomicU64::new(0),
                cb_mgmt_failures: AtomicU64::new(0),
                cb_mgmt_last_failure: AtomicU64::new(0),
            })
        }

        // --- Sign circuit breaker ---

        pub(crate) fn is_sign_circuit_open(&self) -> bool {
            Self::breaker_is_open(&self.cb_sign_failures, &self.cb_sign_last_failure)
        }

        fn record_sign_success(&self) {
            let prev = self.cb_sign_failures.swap(0, Ordering::Relaxed);
            if prev >= KMS_CIRCUIT_THRESHOLD {
                info!("KMS sign circuit breaker recovered");
            }
        }

        fn record_sign_failure(&self) {
            let failures = self.cb_sign_failures.fetch_add(1, Ordering::Relaxed) + 1;
            self.cb_sign_last_failure
                .store(now_secs(), Ordering::Relaxed);
            if failures == KMS_CIRCUIT_THRESHOLD {
                warn!(
                    failures,
                    "KMS sign circuit breaker OPEN — signing will fail fast for {}s",
                    KMS_CIRCUIT_RECOVERY_SECS
                );
            }
        }

        // --- Management circuit breaker ---

        pub(crate) fn is_mgmt_circuit_open(&self) -> bool {
            Self::breaker_is_open(&self.cb_mgmt_failures, &self.cb_mgmt_last_failure)
        }

        fn record_mgmt_success(&self) {
            let prev = self.cb_mgmt_failures.swap(0, Ordering::Relaxed);
            if prev >= KMS_CIRCUIT_THRESHOLD {
                info!("KMS management circuit breaker recovered");
            }
        }

        fn record_mgmt_failure(&self) {
            let failures = self.cb_mgmt_failures.fetch_add(1, Ordering::Relaxed) + 1;
            self.cb_mgmt_last_failure
                .store(now_secs(), Ordering::Relaxed);
            if failures == KMS_CIRCUIT_THRESHOLD {
                warn!(
                    failures,
                    "KMS management circuit breaker OPEN — key creation will fail fast for {}s",
                    KMS_CIRCUIT_RECOVERY_SECS
                );
            }
        }

        // --- Shared breaker logic ---

        /// Returns `true` when failures ≥ threshold and recovery window has not elapsed.
        fn breaker_is_open(failures: &AtomicU64, last_failure: &AtomicU64) -> bool {
            let f = failures.load(Ordering::Relaxed);
            if f < KMS_CIRCUIT_THRESHOLD {
                return false;
            }
            let last = last_failure.load(Ordering::Relaxed);
            if now_secs() - last > KMS_CIRCUIT_RECOVERY_SECS {
                return false;
            }
            true
        }

        /// Check sign-path KMS connectivity for /health.
        pub async fn health_check(&self) -> Result<(), crate::Error> {
            if self.is_sign_circuit_open() {
                return Err(crate::Error::Rpc("KMS sign circuit breaker is open".into()));
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

        /// Fetch Ed25519 public key from a KMS key version. Retries transient errors.
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

                // SPKI DER: 12-byte header + 32-byte Ed25519 key.
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
                self.record_mgmt_success();
                return Ok(pk);
            }

            Err(last_err.unwrap_or_else(|| {
                crate::Error::Rpc("KMS getPublicKey failed after retries".into())
            }))
        }

        /// Sign raw bytes via KMS Ed25519. Returns 64-byte signature.
        pub async fn sign(
            &self,
            resource_name: &str,
            data: &[u8],
        ) -> Result<Signature, crate::Error> {
            let kms_start = Instant::now();

            if self.is_sign_circuit_open() {
                METRICS.kms_sign_errors.fetch_add(1, Ordering::Relaxed);
                return Err(crate::Error::Rpc(
                    "KMS sign circuit breaker open — signing unavailable".into(),
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
                        if attempt + 1 == KMS_MAX_RETRIES {
                            self.record_sign_failure();
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
                            self.record_sign_failure();
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
                    self.record_sign_failure();
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

                self.record_sign_success();
                METRICS.record_kms_sign_duration(kms_start);
                return Ok(Signature::ED25519(ed25519_dalek::Signature::from_bytes(
                    &sig_array,
                )));
            }

            METRICS.kms_sign_errors.fetch_add(1, Ordering::Relaxed);
            Err(last_err
                .unwrap_or_else(|| crate::Error::Rpc("KMS sign failed after retries".into())))
        }

        /// Build and sign a NEAR transaction via KMS (serialize → hash → sign).
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

        /// Build a fully-qualified KMS key version resource name.
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

        /// Fetch public key from KMS and bind it to a NEAR account.
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

        /// Create an Ed25519 key in KMS. Idempotent (409 = already exists).
        /// Returns immediately on 403 (permanent permission error, no retry).
        pub async fn create_key(
            &self,
            project: &str,
            location: &str,
            keyring: &str,
            key_id: &str,
            account_id: &AccountId,
        ) -> Result<KmsKeyRef, crate::Error> {
            if self.is_mgmt_circuit_open() {
                return Err(crate::Error::Rpc(
                    "KMS management circuit breaker open — cannot create key".into(),
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
                        self.record_mgmt_failure();
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
                        self.record_mgmt_failure();
                        warn!(attempt, key_id, error = %e, "KMS createKey request failed (retrying)");
                        last_err = Some(crate::Error::Rpc(format!("KMS createKey failed: {e}")));
                        continue;
                    }
                };

                let status = response.status();
                if status == reqwest::StatusCode::CONFLICT {
                    info!(key_id, "KMS key already exists, fetching public key");
                    self.record_mgmt_success();
                    return self
                        .init_key_ref(project, location, keyring, key_id, 1, account_id)
                        .await;
                }

                if status == reqwest::StatusCode::FORBIDDEN {
                    self.record_mgmt_failure();
                    let body_text = response.text().await.unwrap_or_default();
                    warn!(
                        key_id,
                        "KMS createKey permission denied (403) — not retrying"
                    );
                    return Err(crate::Error::Rpc(format!(
                        "KMS createKey HTTP 403 Forbidden: {body_text}"
                    )));
                }

                if !status.is_success() {
                    self.record_mgmt_failure();
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

                self.record_mgmt_success();
                info!(key_id, "Created new KMS Ed25519 key");
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
