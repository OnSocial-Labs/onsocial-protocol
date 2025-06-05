use crate::constants::{DEFAULT_MIN_BALANCE, MAX_ACCOUNT_ID_LENGTH};
use crate::errors::RelayerError;
use crate::events::log_state_migrated;
use crate::state_versions::VersionedRelayer;
use near_crypto::PublicKey as CryptoPublicKey;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::bs58;
use near_sdk::store::{LazyOption, LookupMap};
use near_sdk::{env, log, AccountId, BorshStorageKey, PublicKey};
use near_sdk_macros::NearSchema;
use semver::Version;
use std::str::FromStr;

pub type MigrationStep = (Version, Version, Box<dyn Fn(&mut Relayer)>);

#[derive(BorshSerialize, BorshDeserialize, BorshStorageKey)]
pub enum StorageKey {
    Nonces,
    PendingRefunds,
    PublicKeyCache,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct NonceEntry {
    pub nonce: u64,
    pub last_updated: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Debug, NearSchema)]
#[abi(borsh)]
pub struct ReentrancyGuard {
    pub is_processing: bool,
}

impl ReentrancyGuard {
    pub fn new() -> Self {
        Self {
            is_processing: false,
        }
    }
    pub fn enter(&mut self) -> Result<(), RelayerError> {
        if self.is_processing {
            return Err(RelayerError::ReentrancyDetected);
        }
        self.is_processing = true;
        Ok(())
    }
    pub fn exit(&mut self) {
        self.is_processing = false;
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug, NearSchema)]
#[abi(borsh)]
pub struct Relayer {
    pub version: String,
    pub manager: AccountId,
    pub min_balance: u128,
    pub nonces: LookupMap<AccountId, NonceEntry>,
    pub platform_public_key: PublicKey,
    pub paused: bool,
    pub version_history: Vec<String>,
    pub sponsorship_guard: ReentrancyGuard,
    pub deposit_guard: ReentrancyGuard,
    pub pending_refunds: LookupMap<AccountId, u128>,
    pub platform_key_cache: LazyOption<PublicKeyCache>,
    // --- New fields for offload recipient and threshold ---
    pub offload_recipient: AccountId,
    pub offload_threshold: u128,
}

impl Relayer {
    pub fn new(
        manager: AccountId,
        platform_public_key: PublicKey,
        offload_recipient: AccountId,
        offload_threshold: u128,
    ) -> Self {
        // Use only the 32 bytes of the Ed25519 key
        let key_bytes = &platform_public_key.as_bytes()[1..];
        let pk_str = bs58::encode(key_bytes).into_string();
        let _platform_crypto_key =
            CryptoPublicKey::from_str(&format!("ed25519:{}", pk_str)).expect("Invalid public key");
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            version_history: vec![env!("CARGO_PKG_VERSION").to_string()],
            manager,
            min_balance: DEFAULT_MIN_BALANCE,
            nonces: LookupMap::new(StorageKey::Nonces),
            platform_public_key,
            paused: false,
            sponsorship_guard: ReentrancyGuard::new(),
            deposit_guard: ReentrancyGuard::new(),
            pending_refunds: LookupMap::new(StorageKey::PendingRefunds),
            platform_key_cache: LazyOption::new(StorageKey::PublicKeyCache, None),
            offload_recipient,
            offload_threshold,
        }
    }

    pub fn get_nonce(&self, account_id: &AccountId) -> u64 {
        self.nonces
            .get(account_id)
            .map(|entry| entry.nonce)
            .unwrap_or(0)
    }

    pub fn prune_nonces_periodic(
        &mut self,
        max_age_ms: u64,
        max_accounts: u32,
        accounts: Vec<AccountId>,
    ) -> (u32, Option<AccountId>) {
        let cutoff = env::block_timestamp_ms().saturating_sub(max_age_ms);
        let max_iterations = max_accounts;
        let mut processed = 0;
        let mut to_remove = Vec::with_capacity(max_iterations as usize);

        for account_id in accounts.iter().take(max_iterations as usize) {
            if let Some(entry) = self.nonces.get(account_id) {
                if entry.last_updated < cutoff {
                    to_remove.push(account_id.clone());
                }
                processed += 1;
            }
        }

        for account_id in &to_remove {
            self.nonces.remove(account_id);
            if self.paused {
                log!("[DEBUG] Pruned nonce for {}", account_id);
            }
        }

        (processed, to_remove.last().cloned())
    }

    pub fn migrate_with_versioned(
        versioned: VersionedRelayer,
    ) -> Result<VersionedRelayer, RelayerError> {
        const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
        let current_version =
            Version::parse(CURRENT_VERSION).map_err(|_| RelayerError::InvalidState)?;
        let old_version_str = versioned.version();
        let old_version =
            Version::parse(&old_version_str).map_err(|_| RelayerError::InvalidState)?;
        let mut new_relayer = versioned.state;
        if old_version < current_version {
            log!(
                "Applying migration from {} to {}",
                old_version,
                current_version
            );
            new_relayer.apply_migration(&old_version, &current_version)?;
        }
        let new_state = VersionedRelayer { state: new_relayer };
        log_state_migrated(&new_state.state, &old_version_str, CURRENT_VERSION);
        log!("Gas used in migrate: {}", env::used_gas().as_gas());
        Ok(new_state)
    }

    fn apply_migration(
        &mut self,
        old_version: &Version,
        current_version: &Version,
    ) -> Result<(), RelayerError> {
        log!(
            "Applying migration from {} to {}",
            old_version,
            current_version
        );
        let migrations: Vec<MigrationStep> = vec![
            (
                Version::parse("0.1.0").unwrap(),
                Version::parse("0.1.1").unwrap(),
                Box::new(|relayer: &mut Relayer| {
                    relayer.version_history.push("0.1.1".to_string());
                }),
            ),
            (
                Version::parse("0.1.1").unwrap(),
                Version::parse("0.1.2").unwrap(),
                Box::new(|relayer: &mut Relayer| {
                    relayer.version_history.push("0.1.2".to_string());
                }),
            ),
        ];

        let mut v = old_version.clone();
        for (from, to, migration_fn) in &migrations {
            if &v == from && to <= current_version {
                migration_fn(self);
                v = to.clone();
            }
        }

        self.version = current_version.to_string();
        self.version_history.push(current_version.to_string());
        if self.manager.len() > MAX_ACCOUNT_ID_LENGTH || self.manager.as_str().is_empty() {
            return Err(RelayerError::InvalidInput(
                "Invalid manager AccountId".to_string(),
            ));
        }
        Ok(())
    }

    pub fn queue_refund(&mut self, account_id: &AccountId, amount: u128) {
        self.pending_refunds.insert(account_id.clone(), amount);
    }

    pub fn clear_refund(&mut self, account_id: &AccountId) -> u128 {
        self.pending_refunds.remove(account_id).unwrap_or(0)
    }

    pub fn get_pending_refund(&self, account_id: &AccountId) -> u128 {
        self.pending_refunds.get(account_id).copied().unwrap_or(0)
    }

    pub fn set_nonce(&mut self, account_id: &AccountId, nonce: u64) {
        let entry = NonceEntry {
            nonce,
            last_updated: env::block_timestamp_ms(),
        };
        self.nonces.insert(account_id.clone(), entry);
    }

    #[cfg(test)]
    pub fn set_nonce_with_timestamp(
        &mut self,
        account_id: &AccountId,
        nonce: u64,
        last_updated: u64,
    ) {
        let entry = NonceEntry {
            nonce,
            last_updated,
        };
        self.nonces.insert(account_id.clone(), entry);
    }

    pub fn get_cached_platform_public_key(&mut self) -> CryptoPublicKey {
        let current_key_bytes = self.platform_public_key.as_bytes()[1..].to_vec(); // Use only the 32 bytes (no prefix)
        let cache = &mut self.platform_key_cache;
        if let Some(cached) = cache.get() {
            if cached.key_bytes == current_key_bytes {
                return cached.parsed_key.clone();
            }
        }
        let parsed_key = CryptoPublicKey::from_str(&format!(
            "ed25519:{}",
            bs58::encode(current_key_bytes.clone()).into_string()
        ))
        .expect("Invalid platform public key");
        cache.set(Some(PublicKeyCache {
            key_bytes: current_key_bytes,
            parsed_key: parsed_key.clone(),
        }));
        parsed_key
    }
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PublicKeyCache {
    pub key_bytes: Vec<u8>,
    pub parsed_key: CryptoPublicKey,
}
