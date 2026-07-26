use crate::{LazyListingRecord, TokenMetadata};
use near_sdk::serde_json::{self, Value};

/// Legacy key from the short-lived extra-based remaining counter. Migrated away.
pub(crate) const EXTRA_SUPPLY_REMAINING: &str = "supplyRemaining";

/// Cap editions per lazy listing (social drops, not collection mint factories).
pub(crate) const MAX_LAZY_COPIES: u64 = 100;

pub(crate) fn resolve_lazy_copies(metadata: &TokenMetadata) -> Result<u64, String> {
    let copies = metadata.copies.unwrap_or(1);
    if copies == 0 || copies > MAX_LAZY_COPIES {
        return Err(format!(
            "copies must be between 1 and {} (got {})",
            MAX_LAZY_COPIES, copies
        ));
    }
    Ok(copies)
}

pub(crate) fn edition_total(listing: &LazyListingRecord) -> u32 {
    listing
        .metadata
        .copies
        .unwrap_or(1)
        .clamp(1, MAX_LAZY_COPIES) as u32
}

pub(crate) fn remaining_editions(listing: &LazyListingRecord) -> u32 {
    edition_total(listing).saturating_sub(listing.minted_count)
}

/// Cap for a single purchase call (listing knob, at least 1, at most MAX_BATCH_MINT).
pub(crate) fn max_per_purchase(listing: &LazyListingRecord) -> u32 {
    let raw = if listing.max_per_purchase == 0 {
        1
    } else {
        listing.max_per_purchase
    };
    raw.clamp(1, crate::MAX_BATCH_MINT)
}

pub(crate) fn resolve_max_per_purchase_input(raw: u32) -> Result<u32, String> {
    if raw == 0 || raw > crate::MAX_BATCH_MINT {
        return Err(format!(
            "max_per_purchase must be between 1 and {}",
            crate::MAX_BATCH_MINT
        ));
    }
    Ok(raw)
}

fn extra_object(metadata: &TokenMetadata) -> serde_json::Map<String, Value> {
    metadata
        .extra
        .as_ref()
        .and_then(|raw| serde_json::from_str::<Value>(raw).ok())
        .and_then(|value| match value {
            Value::Object(map) => Some(map),
            _ => None,
        })
        .unwrap_or_default()
}

/// Remove legacy inventory key from listing / mint metadata.
pub(crate) fn strip_legacy_supply_remaining(metadata: &mut TokenMetadata) -> bool {
    let mut map = extra_object(metadata);
    if map.remove(EXTRA_SUPPLY_REMAINING).is_none() {
        return false;
    }
    metadata.extra = if map.is_empty() {
        None
    } else {
        Some(serde_json::to_string(&Value::Object(map)).unwrap_or_default())
    };
    true
}

/// Token metadata for the buyer — fixed edition size, no inventory keys.
pub(crate) fn metadata_for_mint(listing_metadata: &TokenMetadata) -> TokenMetadata {
    let mut metadata = listing_metadata.clone();
    strip_legacy_supply_remaining(&mut metadata);
    metadata
}
