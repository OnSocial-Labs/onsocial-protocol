use crate::*;
use near_sdk::json_types::Base64VecU8;
use std::collections::HashMap;

pub(crate) fn validate_royalty(royalty: &HashMap<AccountId, u32>) -> Result<(), MarketplaceError> {
    if royalty.is_empty() {
        return Ok(());
    }
    if royalty.len() > 10 {
        return Err(MarketplaceError::InvalidInput(
            "Maximum 10 royalty recipients".into(),
        ));
    }
    let total: u32 = royalty.values().sum();
    if total > MAX_ROYALTY_BPS {
        return Err(MarketplaceError::InvalidInput(format!(
            "Total royalty {} bps exceeds max {} bps (50%)",
            total, MAX_ROYALTY_BPS
        )));
    }
    for bps in royalty.values() {
        if *bps == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Each royalty share must be > 0 bps".into(),
            ));
        }
    }
    Ok(())
}

pub(crate) fn normalize_contract_metadata(
    mut metadata: external::ScarceContractMetadata,
) -> Result<external::ScarceContractMetadata, MarketplaceError> {
    metadata.spec = NFT_METADATA_SPEC.to_string();
    validate_contract_metadata(&metadata)?;
    Ok(metadata)
}

pub(crate) fn validate_contract_metadata(
    metadata: &external::ScarceContractMetadata,
) -> Result<(), MarketplaceError> {
    if metadata.spec != NFT_METADATA_SPEC {
        return Err(MarketplaceError::InvalidInput(format!(
            "Contract metadata spec must be {}",
            NFT_METADATA_SPEC
        )));
    }
    if metadata.name.trim().is_empty() {
        return Err(MarketplaceError::InvalidInput(
            "Contract metadata name is required".into(),
        ));
    }
    if metadata.symbol.trim().is_empty() {
        return Err(MarketplaceError::InvalidInput(
            "Contract metadata symbol is required".into(),
        ));
    }
    validate_hash_pair(
        "reference",
        &metadata.reference,
        "reference_hash",
        &metadata.reference_hash,
    )?;
    Ok(())
}

pub(crate) fn validate_token_metadata(metadata: &TokenMetadata) -> Result<(), MarketplaceError> {
    validate_hash_pair("media", &metadata.media, "media_hash", &metadata.media_hash)?;
    validate_hash_pair(
        "reference",
        &metadata.reference,
        "reference_hash",
        &metadata.reference_hash,
    )?;
    validate_nep177_timestamp_ms("issued_at", metadata.issued_at)?;
    validate_nep177_timestamp_ms("expires_at", metadata.expires_at)?;
    validate_nep177_timestamp_ms("starts_at", metadata.starts_at)?;
    validate_nep177_timestamp_ms("updated_at", metadata.updated_at)?;
    Ok(())
}

fn validate_hash_pair(
    value_name: &str,
    value: &Option<String>,
    hash_name: &str,
    hash: &Option<Base64VecU8>,
) -> Result<(), MarketplaceError> {
    if value.is_some() && hash.is_none() {
        return Err(MarketplaceError::InvalidInput(format!(
            "{} is required when {} is provided",
            hash_name, value_name
        )));
    }

    if let Some(hash) = hash {
        if hash.0.len() != 32 {
            return Err(MarketplaceError::InvalidInput(format!(
                "{} must decode to a 32-byte SHA-256 hash",
                hash_name
            )));
        }
    }

    Ok(())
}

fn validate_nep177_timestamp_ms(
    field_name: &str,
    timestamp: Option<u64>,
) -> Result<(), MarketplaceError> {
    if timestamp.is_some_and(|value| value >= MAX_NEP177_TIMESTAMP_MS) {
        return Err(MarketplaceError::InvalidInput(format!(
            "{} must be a Unix epoch millisecond timestamp",
            field_name
        )));
    }

    Ok(())
}

pub(crate) fn validate_metadata_json(json_str: &str) -> Result<(), MarketplaceError> {
    if json_str.len() > MAX_METADATA_LEN {
        return Err(MarketplaceError::InvalidInput(format!(
            "Metadata exceeds max length of {} bytes",
            MAX_METADATA_LEN
        )));
    }
    let _: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(json_str)
        .map_err(|_| MarketplaceError::InvalidInput("Metadata must be valid JSON".into()))?;
    Ok(())
}
pub fn default_true() -> bool {
    true
}
