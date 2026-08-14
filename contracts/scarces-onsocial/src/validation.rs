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

/// Content-addressed URIs (IPFS) carry integrity in the CID itself, so a
/// separate `media_hash` / `reference_hash` is redundant. This is what makes
/// single-template variation drops possible: one template, per-token media and
/// trait JSON under directory CIDs, no per-token hash needed.
pub(crate) fn is_content_addressed_uri(uri: &str) -> bool {
    uri.starts_with("ipfs://") || uri.contains("/ipfs/")
}

pub(crate) fn validate_token_metadata(metadata: &TokenMetadata) -> Result<(), MarketplaceError> {
    let media_content_addressed = metadata
        .media
        .as_deref()
        .is_some_and(is_content_addressed_uri);
    if !(media_content_addressed && metadata.media_hash.is_none()) {
        validate_hash_pair("media", &metadata.media, "media_hash", &metadata.media_hash)?;
    }
    let reference_content_addressed = metadata
        .reference
        .as_deref()
        .is_some_and(is_content_addressed_uri);
    if !(reference_content_addressed && metadata.reference_hash.is_none()) {
        validate_hash_pair(
            "reference",
            &metadata.reference,
            "reference_hash",
            &metadata.reference_hash,
        )?;
    }
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

/// Default purchase quantity / social lazy max-per-purchase.
pub fn default_one() -> u32 {
    1
}

/// Pre-`max_per_purchase` collections behave like today's uncapped batch (up to MAX_BATCH_MINT).
pub fn default_max_batch_mint() -> u32 {
    crate::MAX_BATCH_MINT
}

/// `near_sdk::store::IterableMap` wraps values as `{ value: V, key_index: u32 }`.
/// Trailing EOF helpers must not consume those final 4 bytes or legacy `V`
/// layouts panic with `try_from_slice` / `WasmTrap(Unreachable)`.
const ITERABLE_MAP_KEY_INDEX_LEN: usize = 4;

/// Peek remaining bytes when the reader is Borsh's `&mut &[u8]` (storage path).
fn slice_remaining<R: near_sdk::borsh::io::Read>(reader: &mut R) -> Option<usize> {
    if std::any::type_name::<R>() != std::any::type_name::<&[u8]>() {
        return None;
    }
    // SAFETY: guarded by type_name; try_from_slice always uses &mut &[u8].
    let slice: &&[u8] = unsafe { &*(reader as *const R as *const &[u8]) };
    Some(slice.len())
}

fn iterable_map_key_index_only<R: near_sdk::borsh::io::Read>(reader: &mut R) -> bool {
    matches!(
        slice_remaining(reader),
        Some(n) if n > 0 && n <= ITERABLE_MAP_KEY_INDEX_LEN
    )
}

/// Append-compatible Borsh read for trailing `u32` (EOF → `default`).
pub fn deserialize_trailing_u32_or<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
    default: u32,
) -> Result<u32, near_sdk::borsh::io::Error> {
    if iterable_map_key_index_only(reader) {
        return Ok(default);
    }
    let mut buf = [0u8; 4];
    match near_sdk::borsh::io::Read::read(reader, &mut buf)? {
        0 => Ok(default),
        4 => Ok(u32::from_le_bytes(buf)),
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing u32 length {n}"),
        )),
    }
}

pub fn deserialize_max_per_purchase_collection<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<u32, near_sdk::borsh::io::Error> {
    deserialize_trailing_u32_or(reader, crate::MAX_BATCH_MINT)
}

pub fn deserialize_minted_count<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<u32, near_sdk::borsh::io::Error> {
    deserialize_trailing_u32_or(reader, 0)
}

pub fn deserialize_max_per_purchase_listing<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<u32, near_sdk::borsh::io::Error> {
    let v = deserialize_trailing_u32_or(reader, 1)?;
    Ok(if v == 0 { 1 } else { v })
}

/// Append-compatible Borsh read for trailing `u16` (EOF → `default`).
pub fn deserialize_trailing_u16_or<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
    default: u16,
) -> Result<u16, near_sdk::borsh::io::Error> {
    if iterable_map_key_index_only(reader) {
        return Ok(default);
    }
    let mut buf = [0u8; 2];
    match near_sdk::borsh::io::Read::read(reader, &mut buf)? {
        0 => Ok(default),
        2 => Ok(u16::from_le_bytes(buf)),
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing u16 length {n}"),
        )),
    }
}

/// Sentinel meaning "legacy record: use live app pool bps".
pub fn default_commission_sentinel() -> u16 {
    u16::MAX
}

pub fn deserialize_trailing_commission_bps<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<u16, near_sdk::borsh::io::Error> {
    deserialize_trailing_u16_or(reader, u16::MAX)
}

/// Append-compatible Borsh read for trailing `bool` (EOF → false).
pub fn deserialize_trailing_bool<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<bool, near_sdk::borsh::io::Error> {
    if iterable_map_key_index_only(reader) {
        return Ok(false);
    }
    let mut buf = [0u8; 1];
    match near_sdk::borsh::io::Read::read(reader, &mut buf)? {
        0 => Ok(false),
        1 => match buf[0] {
            0 => Ok(false),
            1 => Ok(true),
            other => Err(near_sdk::borsh::io::Error::new(
                near_sdk::borsh::io::ErrorKind::InvalidData,
                format!("invalid bool discriminant {other}"),
            )),
        },
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing bool length {n}"),
        )),
    }
}

/// Append-compatible Borsh read for trailing `CreatorAccess` (EOF → Open).
pub fn deserialize_trailing_creator_access<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<crate::CreatorAccess, near_sdk::borsh::io::Error> {
    let mut buf = [0u8; 1];
    match near_sdk::borsh::io::Read::read(reader, &mut buf)? {
        0 => Ok(crate::CreatorAccess::Open),
        1 => match buf[0] {
            0 => Ok(crate::CreatorAccess::Open),
            1 => Ok(crate::CreatorAccess::Approval),
            2 => Ok(crate::CreatorAccess::InviteOnly),
            other => Err(near_sdk::borsh::io::Error::new(
                near_sdk::borsh::io::ErrorKind::InvalidData,
                format!("invalid CreatorAccess discriminant {other}"),
            )),
        },
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing CreatorAccess length {n}"),
        )),
    }
}

/// Append-compatible Borsh read for trailing `Option<AccountId>` (EOF → None).
pub fn deserialize_trailing_option_account_id<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<Option<AccountId>, near_sdk::borsh::io::Error> {
    use near_sdk::borsh::BorshDeserialize;
    let mut tag = [0u8; 1];
    match near_sdk::borsh::io::Read::read(reader, &mut tag)? {
        0 => Ok(None),
        1 => match tag[0] {
            0 => Ok(None),
            1 => Ok(Some(AccountId::deserialize_reader(reader)?)),
            other => Err(near_sdk::borsh::io::Error::new(
                near_sdk::borsh::io::ErrorKind::InvalidData,
                format!("unexpected Option discriminant {other}"),
            )),
        },
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing Option tag length {n}"),
        )),
    }
}

/// Append-compatible Borsh read for trailing `Vec<AccountId>` (EOF → empty).
/// Use for `LookupMap` values (e.g. app pool approved creators).
pub fn deserialize_trailing_account_vec<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<Vec<AccountId>, near_sdk::borsh::io::Error> {
    use near_sdk::borsh::BorshDeserialize;
    let mut len_buf = [0u8; 4];
    match near_sdk::borsh::io::Read::read(reader, &mut len_buf)? {
        0 => Ok(Vec::new()),
        4 => {
            let len = u32::from_le_bytes(len_buf) as usize;
            if len > crate::MAX_COLLECTION_REDEEMERS {
                return Err(near_sdk::borsh::io::Error::new(
                    near_sdk::borsh::io::ErrorKind::InvalidData,
                    format!("trailing AccountId vec length {len} exceeds cap"),
                ));
            }
            let mut out = Vec::with_capacity(len);
            for _ in 0..len {
                out.push(AccountId::deserialize_reader(reader)?);
            }
            Ok(out)
        }
        n => Err(near_sdk::borsh::io::Error::new(
            near_sdk::borsh::io::ErrorKind::InvalidData,
            format!("unexpected trailing Vec length prefix {n}"),
        )),
    }
}

/// Like [`deserialize_trailing_account_vec`], but leaves ≤4 trailing bytes for
/// `IterableMap`'s `{ value, key_index }` wrapper (collection redeemers).
pub fn deserialize_trailing_account_vec_before_map_index<R: near_sdk::borsh::io::Read>(
    reader: &mut R,
) -> Result<Vec<AccountId>, near_sdk::borsh::io::Error> {
    if iterable_map_key_index_only(reader) {
        return Ok(Vec::new());
    }
    deserialize_trailing_account_vec(reader)
}

/// App IDs are unique lowercase slugs (not NEAR accounts).
pub fn validate_app_id(app_id: &str) -> Result<(), MarketplaceError> {
    if app_id.is_empty() {
        return Err(MarketplaceError::InvalidInput(
            "App ID cannot be empty".into(),
        ));
    }
    if app_id.len() < 3 || app_id.len() > 40 {
        return Err(MarketplaceError::InvalidInput(
            "App ID must be 3-40 characters".into(),
        ));
    }
    if app_id == "s" || app_id == "ll" {
        return Err(MarketplaceError::InvalidInput(
            "App ID 's' and 'll' are reserved".into(),
        ));
    }
    if app_id.contains(':') || app_id.contains('.') || app_id.contains('\0') {
        return Err(MarketplaceError::InvalidInput(
            "App ID cannot contain ':', '.', or null characters".into(),
        ));
    }
    if app_id.starts_with('-') || app_id.ends_with('-') {
        return Err(MarketplaceError::InvalidInput(
            "App ID cannot start or end with '-'".into(),
        ));
    }
    if app_id.contains("--") {
        return Err(MarketplaceError::InvalidInput(
            "App ID cannot contain consecutive '--'".into(),
        ));
    }
    if !app_id
        .chars()
        .all(|c| matches!(c, 'a'..='z' | '0'..='9' | '-'))
    {
        return Err(MarketplaceError::InvalidInput(
            "App ID must be lowercase a-z, digits 0-9, and '-' only".into(),
        ));
    }
    Ok(())
}
