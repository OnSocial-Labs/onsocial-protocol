use crate::validation::*;
use crate::*;
use near_sdk::json_types::Base64VecU8;
use std::collections::HashMap;

fn hash_32() -> Base64VecU8 {
    Base64VecU8(vec![0; 32])
}

fn token_metadata() -> TokenMetadata {
    TokenMetadata {
        title: Some("Token".into()),
        description: None,
        media: None,
        media_hash: None,
        copies: None,
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    }
}

#[test]
fn empty_royalty_is_valid() {
    assert!(validate_royalty(&HashMap::new()).is_ok());
}

#[test]
fn single_royalty_ok() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 1000);
    assert!(validate_royalty(&r).is_ok());
}

#[test]
fn max_royalty_50_percent() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 5000);
    assert!(validate_royalty(&r).is_ok());
}

#[test]
fn exceeds_max_royalty() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 5001);
    let err = validate_royalty(&r).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn zero_bps_royalty_invalid() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 0);
    let err = validate_royalty(&r).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn too_many_royalty_recipients() {
    let mut r = HashMap::new();
    for i in 0..11 {
        r.insert(format!("user{}.near", i).parse().unwrap(), 100);
    }
    let err = validate_royalty(&r).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn ten_recipients_is_ok() {
    let mut r = HashMap::new();
    for i in 0..10 {
        r.insert(format!("user{}.near", i).parse().unwrap(), 100);
    }
    assert!(validate_royalty(&r).is_ok());
}

#[test]
fn valid_json_metadata() {
    assert!(validate_metadata_json(r#"{"name":"test"}"#).is_ok());
}

#[test]
fn invalid_json_metadata() {
    let err = validate_metadata_json("not json").unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn oversized_metadata() {
    let long = "a".repeat(MAX_METADATA_LEN + 1);
    let json = format!(r#"{{"x":"{}"}}"#, long);
    let err = validate_metadata_json(&json).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn max_length_metadata_ok() {
    let padding = "x".repeat(MAX_METADATA_LEN - r#"{"k":""}"#.len());
    let json = format!(r#"{{"k":"{}"}}"#, padding);
    assert_eq!(json.len(), MAX_METADATA_LEN);
    assert!(validate_metadata_json(&json).is_ok());
}

#[test]
fn normalize_contract_metadata_repairs_spec() {
    let metadata = external::ScarceContractMetadata {
        spec: "nft-2.0.0".into(),
        name: "OnSocial Scarces".into(),
        symbol: "SCARCE".into(),
        icon: None,
        base_uri: None,
        reference: None,
        reference_hash: None,
    };

    let normalized = normalize_contract_metadata(metadata).unwrap();
    assert_eq!(normalized.spec, NFT_METADATA_SPEC);
}

#[test]
fn contract_metadata_reference_requires_hash() {
    let metadata = external::ScarceContractMetadata {
        spec: NFT_METADATA_SPEC.into(),
        name: "OnSocial Scarces".into(),
        symbol: "SCARCE".into(),
        icon: None,
        base_uri: None,
        reference: Some("ipfs://bafyref".into()),
        reference_hash: None,
    };

    let err = validate_contract_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn contract_metadata_reference_hash_must_be_sha256() {
    let metadata = external::ScarceContractMetadata {
        spec: NFT_METADATA_SPEC.into(),
        name: "OnSocial Scarces".into(),
        symbol: "SCARCE".into(),
        icon: None,
        base_uri: None,
        reference: Some("ipfs://bafyref".into()),
        reference_hash: Some(Base64VecU8(vec![0; 31])),
    };

    let err = validate_contract_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn contract_metadata_reference_with_hash_is_valid() {
    let metadata = external::ScarceContractMetadata {
        spec: NFT_METADATA_SPEC.into(),
        name: "OnSocial Scarces".into(),
        symbol: "SCARCE".into(),
        icon: None,
        base_uri: None,
        reference: Some("ipfs://bafyref".into()),
        reference_hash: Some(hash_32()),
    };

    assert!(validate_contract_metadata(&metadata).is_ok());
}

#[test]
fn token_media_requires_hash() {
    let mut metadata = token_metadata();
    metadata.media = Some("ipfs://bafymedia".into());

    let err = validate_token_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn token_media_hash_must_be_sha256() {
    let mut metadata = token_metadata();
    metadata.media = Some("ipfs://bafymedia".into());
    metadata.media_hash = Some(Base64VecU8(vec![0; 31]));

    let err = validate_token_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn token_media_with_hash_is_valid() {
    let mut metadata = token_metadata();
    metadata.media = Some("ipfs://bafymedia".into());
    metadata.media_hash = Some(hash_32());

    assert!(validate_token_metadata(&metadata).is_ok());
}

#[test]
fn token_reference_requires_hash() {
    let mut metadata = token_metadata();
    metadata.reference = Some("ipfs://bafyref".into());

    let err = validate_token_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn token_reference_with_hash_is_valid() {
    let mut metadata = token_metadata();
    metadata.reference = Some("ipfs://bafyref".into());
    metadata.reference_hash = Some(hash_32());

    assert!(validate_token_metadata(&metadata).is_ok());
}

#[test]
fn token_without_media_or_reference_is_valid() {
    assert!(validate_token_metadata(&token_metadata()).is_ok());
}

#[test]
fn token_metadata_accepts_ms_timestamps() {
    let mut metadata = token_metadata();
    metadata.issued_at = Some(1_700_000_000_000);
    metadata.updated_at = Some(1_700_000_000_001);

    assert!(validate_token_metadata(&metadata).is_ok());
}

#[test]
fn token_metadata_rejects_ns_timestamps() {
    let mut metadata = token_metadata();
    metadata.issued_at = Some(1_700_000_000_000_000_000);

    let err = validate_token_metadata(&metadata).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}
