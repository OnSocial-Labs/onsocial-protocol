// NEP-177 Metadata Implementation
// Uses ScarceContractMetadata from external.rs (single definition)

use crate::external::ScarceContractMetadata;
use crate::*;

#[near]
impl Contract {
    /// Get Scarce contract metadata (NEP-177)
    pub fn nft_metadata(&self) -> ScarceContractMetadata {
        ScarceContractMetadata::default()
    }
}
