// NEP-177 Metadata Implementation
// NFT metadata standard with flexible extra field

use crate::*;

/// NFT Contract Metadata
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
#[borsh(crate = "near_sdk::borsh")]
#[derive(near_sdk::NearSchema)]
pub struct NFTContractMetadata {
    pub spec: String,                   // "nft-1.0.0"
    pub name: String,                   // "OnSocial Marketplace NFTs"
    pub symbol: String,                 // "ONSOCIAL"
    pub icon: Option<String>,           // Data URL
    pub base_uri: Option<String>,       // Centralized gateway for off-chain metadata
    pub reference: Option<String>,      // URL to JSON with more info
    pub reference_hash: Option<String>, // Base64-encoded sha256 hash of JSON
}

impl Default for NFTContractMetadata {
    fn default() -> Self {
        Self {
            spec: "nft-1.0.0".to_string(),
            name: "OnSocial Marketplace NFTs".to_string(),
            symbol: "ONSOCIAL".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        }
    }
}

#[near]
impl Contract {
    /// Get NFT contract metadata (NEP-177)
    pub fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata::default()
    }
}
