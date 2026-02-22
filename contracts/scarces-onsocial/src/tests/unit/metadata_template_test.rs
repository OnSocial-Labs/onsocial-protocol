use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;

fn setup_contract_with_collection(template: &str) -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;

    let config = CollectionConfig {
        collection_id: "col-1".to_string(),
        total_supply: 100,
        metadata_template: template.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .create_collection(&creator(), config)
        .unwrap();
    contract
}

// --- Title substitution ---

#[test]
fn template_title_token_id() {
    let contract = setup_contract_with_collection(
        r#"{"title":"Token {token_id}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"Token {token_id}"}"#,
            "col-1:1",
            0,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "Token col-1:1");
}

#[test]
fn template_title_seat_number() {
    let contract = setup_contract_with_collection(
        r#"{"title":"Seat #{seat_number}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"Seat #{seat_number}"}"#,
            "col-1:5",
            4, // index=4, seat_number=5
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "Seat #5");
}

#[test]
fn template_title_index() {
    let contract = setup_contract_with_collection(
        r#"{"title":"Item {index}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"Item {index}"}"#,
            "col-1:1",
            42,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "Item 42");
}

#[test]
fn template_title_collection_id() {
    let contract = setup_contract_with_collection(
        r#"{"title":"{collection_id} pass"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"{collection_id} pass"}"#,
            "col-1:1",
            0,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "col-1 pass");
}

// --- Description substitution ---

#[test]
fn template_description_owner() {
    let contract = setup_contract_with_collection(
        r#"{"description":"Owned by {owner}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"description":"Owned by {owner}"}"#,
            "col-1:1",
            0,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(
        meta.description.unwrap(),
        format!("Owned by {}", buyer())
    );
}

// --- Media / Reference substitution ---

#[test]
fn template_media_substitution() {
    let contract = setup_contract_with_collection(
        r#"{"media":"https://img.io/{collection_id}/{seat_number}.png"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"media":"https://img.io/{collection_id}/{seat_number}.png"}"#,
            "col-1:3",
            2,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.media.unwrap(), "https://img.io/col-1/3.png");
}

#[test]
fn template_reference_substitution() {
    let contract = setup_contract_with_collection(
        r#"{"reference":"https://api.io/{token_id}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"reference":"https://api.io/{token_id}"}"#,
            "col-1:7",
            6,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.reference.unwrap(), "https://api.io/col-1:7");
}

// --- Extra with minted_at ---

#[test]
fn template_extra_minted_at() {
    let contract = setup_contract_with_collection(
        r#"{"extra":"{\"minted_at\":\"{minted_at}\"}"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"extra":"{\"minted_at\":\"{minted_at}\"}"}"#,
            "col-1:1",
            0,
            &buyer(),
            "col-1",
        )
        .unwrap();
    let extra = meta.extra.unwrap();
    // Should contain the block timestamp, not the placeholder
    assert!(!extra.contains("{minted_at}"));
    assert!(extra.contains("1700000000000000000")); // our test timestamp
}

// --- issued_at is auto-set ---

#[test]
fn template_issued_at_set() {
    let contract = setup_contract_with_collection(r#"{"title":"t"}"#);
    let meta = contract
        .generate_metadata_from_template(r#"{"title":"t"}"#, "col-1:1", 0, &buyer(), "col-1")
        .unwrap();
    assert!(meta.issued_at.is_some());
}

// --- copies auto-filled from collection total_supply ---

#[test]
fn template_copies_auto_filled() {
    let contract = setup_contract_with_collection(r#"{"title":"t"}"#);
    // template has no copies field → auto-filled
    let meta = contract
        .generate_metadata_from_template(r#"{"title":"t"}"#, "col-1:1", 0, &buyer(), "col-1")
        .unwrap();
    assert_eq!(meta.copies, Some(100)); // total_supply
}

#[test]
fn template_copies_not_overridden_when_set() {
    let contract = setup_contract_with_collection(r#"{"title":"t","copies":5}"#);
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"t","copies":5}"#,
            "col-1:1",
            0,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.copies, Some(5)); // kept from template
}

// --- Invalid template ---

#[test]
fn template_invalid_json_fails() {
    let contract = setup_contract_with_collection(r#"{"title":"t"}"#);
    let result = contract
        .generate_metadata_from_template("not json", "col-1:1", 0, &buyer(), "col-1");
    assert!(matches!(result, Err(MarketplaceError::InvalidInput(_))));
}

// --- Multiple placeholders in one field ---

#[test]
fn template_multiple_placeholders_in_title() {
    let contract = setup_contract_with_collection(
        r#"{"title":"{collection_id} #{seat_number} ({token_id})"}"#,
    );
    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"{collection_id} #{seat_number} ({token_id})"}"#,
            "col-1:2",
            1,
            &buyer(),
            "col-1",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "col-1 #2 (col-1:2)");
}
