// NEP-177 Metadata Implementation
// Returns stored contract metadata (configurable via set_contract_metadata)

use crate::*;

#[near]
impl Contract {
    /// Get Scarce contract metadata (NEP-177).
    /// Returns the stored metadata set via `set_contract_metadata()`.
    /// Wallets, explorers, and indexers call this to display contract branding.
    pub fn nft_metadata(&self) -> external::ScarceContractMetadata {
        self.contract_metadata.clone()
    }
}
