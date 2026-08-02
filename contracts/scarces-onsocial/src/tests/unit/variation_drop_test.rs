//! Variation drops — one collection, one template, per-token media resolved
//! by `{seat_number}` under a content-addressed (IPFS) directory.

use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

const VARIATION_TEMPLATE: &str =
    r#"{"title":"Ink Study #{seat_number}","media":"ipfs://bafydir/{seat_number}.png","copies":1}"#;

fn variation_config(collection_id: &str, total_supply: u32) -> CollectionConfig {
    CollectionConfig {
        collection_id: collection_id.to_string(),
        total_supply,
        metadata_template: VARIATION_TEMPLATE.to_string(),
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
        max_per_purchase: None,
        random_assignment: false,
    }
}

fn purchase(contract: &mut Contract, account: AccountId, collection_id: &str, quantity: u32) {
    testing_env!(context_with_deposit(account, 0).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: collection_id.to_string(),
            quantity,
            max_price_per_token: U128(0),
        }))
        .unwrap();
}

#[test]
fn ipfs_media_template_without_hash_creates() {
    let mut contract = new_contract();
    contract
        .create_collection(&creator(), variation_config("vars", 10))
        .unwrap();
}

#[test]
fn gateway_ipfs_path_media_without_hash_creates() {
    let mut contract = new_contract();
    let mut config = variation_config("vars", 10);
    config.metadata_template =
        r##"{"title":"#{seat_number}","media":"https://gw.example/ipfs/bafydir/{seat_number}.png"}"##
            .to_string();
    contract.create_collection(&creator(), config).unwrap();
}

#[test]
fn non_content_addressed_media_without_hash_fails() {
    let mut contract = new_contract();
    let mut config = variation_config("vars", 10);
    config.metadata_template =
        r##"{"title":"#{seat_number}","media":"https://cdn.example/{seat_number}.png"}"##
            .to_string();
    let err = contract.create_collection(&creator(), config).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn purchase_batches_interpolate_global_seat_numbers() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), variation_config("vars", 10))
        .unwrap();

    purchase(&mut contract, buyer(), "vars", 3);
    purchase(&mut contract, owner(), "vars", 2);

    for seat in 1..=5u32 {
        let token = contract.scarces_by_id.get(&format!("vars:{seat}")).unwrap();
        assert_eq!(
            token.metadata.media.as_deref(),
            Some(format!("ipfs://bafydir/{seat}.png").as_str()),
            "seat {seat} media must use the global mint position"
        );
        assert_eq!(
            token.metadata.title.as_deref(),
            Some(format!("Ink Study #{seat}").as_str())
        );
    }
}

#[test]
fn airdrop_after_purchase_continues_seat_numbers() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), variation_config("vars", 10))
        .unwrap();

    purchase(&mut contract, buyer(), "vars", 2);

    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::AirdropFromCollection {
            collection_id: "vars".to_string(),
            receivers: vec![owner(), buyer()],
        }))
        .unwrap();

    let third = contract.scarces_by_id.get("vars:3").unwrap();
    assert_eq!(
        third.metadata.media.as_deref(),
        Some("ipfs://bafydir/3.png")
    );
    let fourth = contract.scarces_by_id.get("vars:4").unwrap();
    assert_eq!(
        fourth.metadata.media.as_deref(),
        Some("ipfs://bafydir/4.png")
    );
}

#[test]
fn variation_template_keeps_copies_one() {
    let mut contract = new_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), variation_config("vars", 10))
        .unwrap();

    purchase(&mut contract, buyer(), "vars", 1);

    let token = contract.scarces_by_id.get("vars:1").unwrap();
    assert_eq!(token.metadata.copies, Some(1));
}
