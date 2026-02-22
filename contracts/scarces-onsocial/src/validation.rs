use crate::*;
use std::collections::HashMap;
pub(crate) fn validate_royalty(
    royalty: &HashMap<AccountId, u32>,
) -> Result<(), MarketplaceError> {
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
