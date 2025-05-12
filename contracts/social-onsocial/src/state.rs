use crate::events::SocialEvent;
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, AccountId};
use near_sdk_macros::NearSchema;
use semver::Version;

#[derive(BorshDeserialize, BorshSerialize, NearSchema)]
#[abi(borsh)]
pub struct SocialContractState {
    pub version: String,
    pub manager: AccountId,
}

impl SocialContractState {
    pub fn new(manager: AccountId) -> Self {
        Self {
            version: env!("CARGO_PKG_VERSION").to_string(),
            manager,
        }
    }

    pub fn is_manager(&self, account_id: &AccountId) -> bool {
        &self.manager == account_id
    }

    pub fn migrate() -> Self {
        const CURRENT_VERSION: &str = env!("CARGO_PKG_VERSION");
        let current_version =
            Version::parse(CURRENT_VERSION).expect("Invalid current version in Cargo.toml");

        let state_bytes: Vec<u8> = env::state_read().unwrap_or_default();

        // Try current version
        if let Ok(state) = borsh::from_slice::<SocialContractState>(&state_bytes) {
            if let Ok(state_version) = Version::parse(&state.version) {
                if state_version < current_version {
                    env::log_str("State is at current or newer version, no migration needed");
                    return state;
                }
            }
        }

        // Try version 0.1.0 or earlier
        if let Ok(old_state) = borsh::from_slice::<super::state_versions::StateV010>(&state_bytes) {
            if let Ok(old_version) = Version::parse(&old_state.version) {
                if old_version <= Version::parse("0.1.0").unwrap() {
                    env::log_str(&format!(
                        "Migrating from state version {}",
                        old_state.version
                    ));
                    let new_state = Self {
                        version: CURRENT_VERSION.to_string(),
                        manager: old_state.manager,
                    };
                    SocialEvent::StateMigrated {
                        old_version: old_state.version,
                        new_version: CURRENT_VERSION.to_string(),
                    }
                    .emit();
                    return new_state;
                }
            }
        }

        // Initialize new state if no valid prior state is found
        env::log_str("No valid prior state found or unknown version, initializing new state");
        Self::new(env::current_account_id())
    }
}
