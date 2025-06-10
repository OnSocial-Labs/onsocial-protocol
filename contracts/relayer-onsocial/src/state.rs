use crate::constants::{DEFAULT_MIN_BALANCE, MAX_ACCOUNT_ID_LENGTH};
use crate::errors::RelayerError;
use crate::events::log_state_migrated;
use crate::state_versions::VersionedRelayer;
use ed25519_dalek::VerifyingKey as DalekPublicKey;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::store::{LazyOption, LookupMap};
use near_sdk::{env, log, AccountId, BorshStorageKey};
use near_sdk_macros::NearSchema;
use semver::Version;

#[derive(BorshSerialize, BorshDeserialize, BorshStorageKey)]
pub enum StorageKey {
    Nonces,
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
    pub platform_public_key: [u8; 32],
    pub paused: bool,
    pub sponsorship_guard: ReentrancyGuard,
    pub deposit_guard: ReentrancyGuard,
    pub platform_key_cache: LazyOption<PublicKeyCache>,
    pub offload_recipient: AccountId,
    pub offload_threshold: u128,
}

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct PublicKeyCache {
    pub key_bytes: [u8; 32],
}

impl Relayer {
    pub fn new(
        manager: AccountId,
        platform_public_key: [u8; 32],
        offload_recipient: AccountId,
        offload_threshold: u128,
    ) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            manager,
            min_balance: DEFAULT_MIN_BALANCE,
            nonces: LookupMap::new(StorageKey::Nonces),
            platform_public_key,
            paused: false,
            sponsorship_guard: ReentrancyGuard::new(),
            deposit_guard: ReentrancyGuard::new(),
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

    pub fn batch_update_nonces<I>(&mut self, updates: I)
    where
        I: IntoIterator<Item = (AccountId, Option<u64>)>,
    {
        for (account_id, maybe_nonce) in updates {
            match maybe_nonce {
                Some(nonce) if nonce > 0 => {
                    let current = self.nonces.get(&account_id).map(|e| e.nonce);
                    if current != Some(nonce) {
                        self.set_nonce(&account_id, nonce);
                    }
                }
                _ => {
                    if self.nonces.get(&account_id).is_some() {
                        self.nonces.remove(&account_id);
                        crate::events::log_nonce_reset(
                            self,
                            &account_id,
                            env::block_timestamp_ms(),
                        );
                    }
                }
            }
        }
    }

    pub fn prune_nonces_periodic(
        &mut self,
        max_age_ms: u64,
        max_accounts: u32,
        accounts: Vec<AccountId>,
    ) -> (u32, Option<AccountId>) {
        let current_time = env::block_timestamp_ms();
        let max_iterations = max_accounts;
        let mut processed = 0;
        let mut updates = Vec::with_capacity(max_iterations as usize);

        for account_id in accounts.iter().take(max_iterations as usize) {
            if let Some(entry) = self.nonces.get(account_id) {
                if current_time.saturating_sub(entry.last_updated) > max_age_ms {
                    updates.push((account_id.clone(), None));
                    processed += 1;
                }
            }
        }

        self.batch_update_nonces(updates);
        (
            processed,
            accounts
                .iter()
                .take(processed as usize)
                .next_back()
                .cloned(),
        )
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
        // No version_history logic needed
        self.version = current_version.to_string();
        if self.manager.len() > MAX_ACCOUNT_ID_LENGTH || self.manager.as_str().is_empty() {
            return Err(RelayerError::InvalidInput(
                "Invalid manager AccountId".to_string(),
            ));
        }
        Ok(())
    }

    pub fn set_nonce(&mut self, account_id: &AccountId, nonce: u64) {
        let entry = NonceEntry {
            nonce,
            last_updated: env::block_timestamp_ms(),
        };
        if nonce == 0 {
            self.nonces.remove(account_id);
            crate::events::log_nonce_reset(self, account_id, env::block_timestamp_ms());
        } else {
            self.nonces.insert(account_id.clone(), entry);
        }
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

    pub fn get_cached_platform_public_key(&mut self) -> Result<DalekPublicKey, RelayerError> {
        let current_key_bytes = self.platform_public_key;
        let cache = &mut self.platform_key_cache;
        if let Some(cached) = cache.get() {
            if cached.key_bytes == current_key_bytes {
                return DalekPublicKey::from_bytes(&cached.key_bytes).map_err(|_| {
                    RelayerError::InvalidInput("Invalid platform public key bytes".to_string())
                });
            }
        }
        let parsed_key = DalekPublicKey::from_bytes(&current_key_bytes).map_err(|_| {
            RelayerError::InvalidInput("Invalid platform public key bytes".to_string())
        })?;
        cache.set(Some(PublicKeyCache {
            key_bytes: current_key_bytes,
        }));
        Ok(parsed_key)
    }
}
