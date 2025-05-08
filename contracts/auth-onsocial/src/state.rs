use crate::errors::AuthError;
use crate::events::AuthEvent;
use crate::state_versions::StateV010;
use crate::types::{KeyInfo, RotateKeyArgs};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::{IterableSet, LookupMap, Vector};
use near_sdk::{env, log, AccountId, BorshStorageKey, Gas, NearToken, Promise, PublicKey};
use semver::Version;

const CALL_GAS: Gas = Gas::from_tgas(200);
const NO_ARGS: Vec<u8> = vec![];

#[derive(BorshSerialize, BorshDeserialize, BorshStorageKey)]
#[borsh(crate = "near_sdk::borsh")]
pub enum StorageKey {
    Keys,
    KeySet { account_id: AccountId },
    LastActive,
    Accounts,
}

#[derive(BorshSerialize, BorshDeserialize, near_sdk_macros::NearSchema)]
#[borsh(crate = "near_sdk::borsh")]
#[abi(borsh)]
pub struct AuthContractState {
    pub version: String,
    pub keys: LookupMap<AccountId, IterableSet<KeyInfo>>,
    pub last_active_timestamps: LookupMap<AccountId, u64>,
    pub registered_accounts: Vector<AccountId>,
    pub manager: AccountId,
    pub max_keys_per_account: u32,
}

impl AuthContractState {
    pub fn new() -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            keys: LookupMap::new(StorageKey::Keys),
            last_active_timestamps: LookupMap::new(StorageKey::LastActive),
            registered_accounts: Vector::new(StorageKey::Accounts),
            manager: env::predecessor_account_id(),
            max_keys_per_account: 100,
        }
    }

    pub fn is_authorized(
        &mut self,
        account_id: &AccountId,
        public_key: &PublicKey,
        signatures: Option<Vec<Vec<u8>>>,
    ) -> bool {
        let key_set = match self.keys.get(account_id) {
            Some(set) => set,
            None => return false,
        };

        let key_info = match key_set.iter().find(|k| k.public_key == *public_key) {
            Some(info) => info,
            None => return false,
        };

        if let Some(expiration) = key_info.expiration_timestamp {
            if env::block_timestamp_ms() > expiration {
                return false;
            }
        }

        let authorized = if key_info.is_multi_sig {
            let threshold = key_info.multi_sig_threshold.unwrap_or(1);
            let signatures = signatures.unwrap_or_default();
            signatures.len() as u32 >= threshold
        } else {
            true
        };

        if authorized {
            self.last_active_timestamps
                .insert(account_id.clone(), env::block_timestamp_ms());
        }

        authorized
    }

    pub fn register_key(
        &mut self,
        caller: &AccountId,
        account_id: &AccountId,
        public_key: PublicKey,
        expiration_days: Option<u32>,
        is_multi_sig: bool,
        multi_sig_threshold: Option<u32>,
    ) -> Result<(), AuthError> {
        log!("Registering key for account: {}", account_id);
        if caller != account_id {
            return Err(AuthError::Unauthorized);
        }

        let expiration_timestamp = expiration_days
            .map(|days| env::block_timestamp_ms() + (days as u64 * 24 * 60 * 60 * 1000));

        let key_info = KeyInfo {
            public_key: public_key.clone(),
            expiration_timestamp,
            is_multi_sig,
            multi_sig_threshold,
        };

        if self.keys.get(account_id).is_none() {
            log!("Creating new key set for account: {}", account_id);
            self.keys.insert(
                account_id.clone(),
                IterableSet::new(StorageKey::KeySet {
                    account_id: account_id.clone(),
                }),
            );
            self.registered_accounts.push(account_id.clone());
        }

        let key_set = self.keys.get_mut(account_id).expect("Key set should exist");
        if key_set.contains(&key_info) {
            return Err(AuthError::KeyAlreadyExists);
        }
        if key_set.len() >= self.max_keys_per_account {
            return Err(AuthError::KeyAlreadyExists); // Reuse error for max keys limit
        }
        key_set.insert(key_info);

        self.last_active_timestamps
            .insert(account_id.clone(), env::block_timestamp_ms());

        AuthEvent::KeyRegistered {
            account_id: account_id.clone(),
            public_key: format!("{:?}", public_key),
        }
        .emit();

        Ok(())
    }

    pub fn remove_key(
        &mut self,
        caller: &AccountId,
        account_id: &AccountId,
        public_key: PublicKey,
    ) -> Result<(), AuthError> {
        if caller != account_id {
            return Err(AuthError::Unauthorized);
        }

        let key_set = self
            .keys
            .get_mut(account_id)
            .ok_or(AuthError::KeyNotFound)?;
        let key_info = KeyInfo {
            public_key: public_key.clone(),
            expiration_timestamp: None,
            is_multi_sig: false,
            multi_sig_threshold: None,
        };
        if !key_set.remove(&key_info) {
            return Err(AuthError::KeyNotFound);
        }

        if key_set.is_empty() {
            self.keys.remove(account_id);
            self.last_active_timestamps.remove(account_id);
            if let Some(index) = self
                .registered_accounts
                .iter()
                .position(|id| id == account_id)
            {
                self.registered_accounts.swap_remove(index as u32);
            }
        }

        AuthEvent::KeyRemoved {
            account_id: account_id.clone(),
            public_key: format!("{:?}", public_key),
        }
        .emit();

        Ok(())
    }

    pub fn rotate_key(&mut self, caller: &AccountId, args: RotateKeyArgs) -> Result<(), AuthError> {
        if caller != &args.account_id {
            return Err(AuthError::Unauthorized);
        }

        let key_set = self
            .keys
            .get_mut(&args.account_id)
            .ok_or(AuthError::KeyNotFound)?;
        let old_key_info = KeyInfo {
            public_key: args.old_public_key.clone(),
            expiration_timestamp: None,
            is_multi_sig: false,
            multi_sig_threshold: None,
        };
        if !key_set.contains(&old_key_info) {
            return Err(AuthError::KeyNotFound);
        }

        let new_key_info = KeyInfo {
            public_key: args.new_public_key.clone(),
            expiration_timestamp: args
                .expiration_days
                .map(|days| env::block_timestamp_ms() + (days as u64 * 24 * 60 * 60 * 1000)),
            is_multi_sig: args.is_multi_sig,
            multi_sig_threshold: args.multi_sig_threshold,
        };
        if key_set.contains(&new_key_info) {
            return Err(AuthError::KeyAlreadyExists);
        }

        key_set.remove(&old_key_info);
        key_set.insert(new_key_info);
        self.last_active_timestamps
            .insert(args.account_id.clone(), env::block_timestamp_ms());

        AuthEvent::KeyRotated {
            account_id: args.account_id.clone(),
            old_public_key: format!("{:?}", args.old_public_key),
            new_public_key: format!("{:?}", args.new_public_key),
        }
        .emit();

        Ok(())
    }

    pub fn remove_expired_keys(&mut self, account_id: &AccountId) -> Result<(), AuthError> {
        let key_set = self
            .keys
            .get_mut(account_id)
            .ok_or(AuthError::KeyNotFound)?;
        let current_timestamp = env::block_timestamp_ms();
        let mut to_remove = Vec::new();

        for key_info in key_set.iter() {
            if key_info
                .expiration_timestamp
                .is_some_and(|exp| current_timestamp > exp)
            {
                to_remove.push(key_info.clone());
            }
        }

        for key_info in to_remove {
            key_set.remove(&key_info);
            AuthEvent::KeyRemoved {
                account_id: account_id.clone(),
                public_key: format!("{:?}", key_info.public_key),
            }
            .emit();
        }

        if key_set.is_empty() {
            self.keys.remove(account_id);
            self.last_active_timestamps.remove(account_id);
            if let Some(index) = self
                .registered_accounts
                .iter()
                .position(|id| id == account_id)
            {
                self.registered_accounts.swap_remove(index as u32);
            }
        }

        Ok(())
    }

    pub fn remove_inactive_accounts(&mut self, account_id: AccountId) -> Result<(), AuthError> {
        let last_active = self
            .last_active_timestamps
            .get(&account_id)
            .ok_or(AuthError::KeyNotFound)?;
        let current_timestamp = env::block_timestamp_ms();
        const ONE_YEAR_MS: u64 = 31_536_000_000;

        if current_timestamp <= last_active + ONE_YEAR_MS {
            return Err(AuthError::AccountStillActive);
        }

        let key_set = self
            .keys
            .get_mut(&account_id)
            .ok_or(AuthError::KeyNotFound)?;
        let to_remove: Vec<_> = key_set.iter().cloned().collect();
        for key_info in to_remove {
            key_set.remove(&key_info);
            AuthEvent::KeyRemoved {
                account_id: account_id.clone(),
                public_key: format!("{:?}", key_info.public_key),
            }
            .emit();
        }

        self.keys.remove(&account_id);
        self.last_active_timestamps.remove(&account_id);
        if let Some(index) = self
            .registered_accounts
            .iter()
            .position(|id| id == &account_id)
        {
            self.registered_accounts.swap_remove(index as u32);
        }

        Ok(())
    }

    pub fn get_inactive_accounts(&self, limit: u32, offset: u32) -> Vec<AccountId> {
        assert!(limit <= 100, "Limit exceeds maximum allowed value");
        let current_timestamp = env::block_timestamp_ms();
        const ONE_YEAR_MS: u64 = 31_536_000_000;
        let mut inactive_accounts = Vec::new();
        let start = offset as usize;
        let end = (offset + limit) as usize;

        for account_id in self
            .registered_accounts
            .iter()
            .skip(start)
            .take(end - start)
        {
            if let Some(timestamp) = self.last_active_timestamps.get(account_id) {
                if current_timestamp > timestamp + ONE_YEAR_MS {
                    inactive_accounts.push(account_id.clone());
                }
            }
        }
        inactive_accounts
    }

    pub fn get_key_info(&self, account_id: &AccountId, public_key: &PublicKey) -> Option<KeyInfo> {
        self.keys
            .get(account_id)
            .and_then(|set| set.iter().find(|k| k.public_key == *public_key).cloned())
    }

    pub fn get_keys(&self, account_id: &AccountId, limit: u32, offset: u32) -> Vec<KeyInfo> {
        assert!(limit <= 100, "Limit exceeds maximum allowed value");
        let key_set = match self.keys.get(account_id) {
            Some(set) => set,
            None => return Vec::new(),
        };
        let start = offset as usize;
        let end = (offset + limit) as usize;
        key_set
            .iter()
            .skip(start)
            .take(end - start)
            .cloned()
            .collect()
    }

    pub fn update_contract(&mut self) -> Result<Promise, AuthError> {
        if env::predecessor_account_id() != self.manager {
            return Err(AuthError::Unauthorized);
        }
        let code = env::input()
            .filter(|input| !input.is_empty())
            .ok_or(AuthError::MissingInput)?
            .to_vec();
        log!("Upgrading contract by manager: {}", self.manager);
        AuthEvent::ContractUpgraded {
            manager: self.manager.clone(),
            timestamp: env::block_timestamp_ms(),
        }
        .emit();
        Ok(Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                NO_ARGS,
                NearToken::from_near(0),
                CALL_GAS,
            ))
    }

    pub fn set_manager(
        &mut self,
        caller: &AccountId,
        new_manager: AccountId,
    ) -> Result<(), AuthError> {
        if caller != &self.manager {
            return Err(AuthError::Unauthorized);
        }
        log!("Changing manager from {} to {}", caller, new_manager);
        self.manager = new_manager.clone();
        AuthEvent::ManagerChanged {
            old_manager: caller.clone(),
            new_manager,
            timestamp: env::block_timestamp_ms(),
        }
        .emit();
        Ok(())
    }

    pub fn migrate() -> Self {
        const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
        let current_version =
            Version::parse(CURRENT_VERSION).expect("Invalid current version in Cargo.toml");

        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version
        if let Ok(state) = near_sdk::borsh::from_slice::<AuthContractState>(&state_bytes) {
            if let Ok(state_version) = Version::parse(&state.version) {
                if state_version >= current_version {
                    env::log_str("State is at current or newer version, no migration needed");
                    return state;
                }
            }
        }

        // Try version 0.1.0
        if let Ok(old_state) = near_sdk::borsh::from_slice::<StateV010>(&state_bytes) {
            if let Ok(old_version) = Version::parse(&old_state.version) {
                if old_version <= Version::parse("0.1.0").unwrap() {
                    env::log_str(&format!(
                        "Migrating from state version {}",
                        old_state.version
                    ));
                    let new_state = AuthContractState {
                        version: CURRENT_VERSION.to_string(),
                        keys: old_state.keys,
                        last_active_timestamps: old_state.last_active_timestamps,
                        registered_accounts: old_state.registered_accounts,
                        manager: old_state.manager,
                        max_keys_per_account: 100,
                    };
                    AuthEvent::StateMigrated {
                        old_version: old_state.version,
                        new_version: CURRENT_VERSION.to_string(),
                    }
                    .emit();
                    return new_state;
                }
            }
        }

        // If no valid state was found or version is unknown, initialize a new state
        env::log_str("No valid prior state found or unknown version, initializing new state");
        Self::new()
    }
}

impl Default for AuthContractState {
    fn default() -> Self {
        Self::new()
    }
}
