use crate::validation::*;
use crate::*;
use std::collections::HashMap;

// --- validate_royalty ---

#[test]
fn empty_royalty_is_valid() {
    assert!(validate_royalty(&HashMap::new()).is_ok());
}

#[test]
fn single_royalty_ok() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 1000); // 10%
    assert!(validate_royalty(&r).is_ok());
}

#[test]
fn max_royalty_50_percent() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 5000); // 50% exactly
    assert!(validate_royalty(&r).is_ok());
}

#[test]
fn exceeds_max_royalty() {
    let mut r = HashMap::new();
    r.insert("alice.near".parse().unwrap(), 5001); // 50.01%
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
        r.insert(format!("user{}.near", i).parse().unwrap(), 100); // 10 × 1% = 10%
    }
    assert!(validate_royalty(&r).is_ok());
}

// --- validate_metadata_json ---

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
    // Build a JSON string that is exactly MAX_METADATA_LEN bytes.
    let padding = "x".repeat(MAX_METADATA_LEN - r#"{"k":""}"#.len());
    let json = format!(r#"{{"k":"{}"}}"#, padding);
    assert_eq!(json.len(), MAX_METADATA_LEN);
    assert!(validate_metadata_json(&json).is_ok());
}
