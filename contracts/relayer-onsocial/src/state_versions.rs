use crate::errors::RelayerError;
use crate::state::Relayer;
use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::log;
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;
use semver::Version;

#[derive(BorshSerialize, BorshDeserialize, Debug, NearSchema)]
#[abi(borsh)]
pub struct VersionedRelayer {
    pub state: Relayer,
}

impl VersionedRelayer {
    pub fn as_ref(&self) -> &Relayer {
        &self.state
    }

    pub fn as_mut(&mut self) -> &mut Relayer {
        &mut self.state
    }

    pub fn version(&self) -> String {
        self.state.version.clone()
    }

    pub fn migrate(&mut self) {
        let current_version = Version::parse(&self.state.version)
            .unwrap_or_else(|_| Version::parse("0.1.0").unwrap());
        let latest_version = Version::parse(&Self::latest_version()).unwrap();
        if current_version < latest_version {
            self.state.version = Self::latest_version();
        }
    }

    pub fn latest_version() -> String {
        env!("CARGO_PKG_VERSION").to_string()
    }

    pub fn from_state_bytes_with_fallback(
        bytes: &[u8],
        force_init: bool,
        manager: AccountId,
        platform_public_key: [u8; 32],
        offload_recipient: AccountId,
        offload_threshold: u128,
    ) -> Result<Self, RelayerError> {
        if bytes.is_empty() {
            log!("State bytes are empty");
            if force_init {
                log!("Reconstructing state due to empty bytes and force_init");
                return Ok(VersionedRelayer {
                    state: Relayer::new(
                        manager,
                        platform_public_key,
                        offload_recipient,
                        offload_threshold,
                    ),
                });
            }
            return Err(RelayerError::InvalidState);
        }
        match borsh::from_slice::<VersionedRelayer>(bytes) {
            Ok(mut state) => {
                state.migrate();
                Ok(state)
            }
            Err(e) => {
                log!(
                    "Corrupt state: deserialization failed: {} | bytes omitted for security",
                    e
                );
                if force_init {
                    log!("Reconstructing state due to deserialization failure and force_init");
                    Ok(VersionedRelayer {
                        state: Relayer::new(
                            manager,
                            platform_public_key,
                            offload_recipient,
                            offload_threshold,
                        ),
                    })
                } else {
                    Err(RelayerError::InvalidState)
                }
            }
        }
    }
}
