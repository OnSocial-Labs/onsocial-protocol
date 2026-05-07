use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn app_id() -> AccountId {
    "store.near".parse().unwrap()
}

fn other_creator() -> AccountId {
    "creator2.near".parse().unwrap()
}

fn register_app(contract: &mut Contract, metadata: Option<String>) {
    testing_env!(context_with_deposit(owner(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig {
                max_user_bytes: Some(1_000_000),
                default_royalty: None,
                primary_sale_bps: None,
                curated: Some(false),
                metadata,
            },
        }))
        .unwrap();
}

fn create_collection(contract: &mut Contract, who: &AccountId, col_id: &str, supply: u32) {
    testing_env!(context(who.clone()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: CollectionConfig {
                collection_id: col_id.to_string(),
                total_supply: supply,
                metadata_template: r#"{"title":"T"}"#.to_string(),
                price_near: U128(0),
                start_time: None,
                end_time: None,
                options: ScarceOptions {
                    royalty: None,
                    app_id: Some(app_id()),
                    transferable: true,
                    burnable: true,
                },
                renewable: false,
                revocation_mode: collections::RevocationMode::None,
                max_redeems: None,
                mint_mode: collections::MintMode::Open,
                metadata: None,
                max_per_wallet: None,
                start_price: None,
                allowlist_price: None,
            },
        }))
        .unwrap();
}

#[test]
fn app_creator_tracked_on_create_untracked_on_delete() {
    let mut contract = new_contract();
    register_app(&mut contract, None);

    create_collection(&mut contract, &creator(), "c1", 10);
    assert!(contract.is_app_creator(app_id(), creator()));
    assert_eq!(contract.get_app_creator_count(app_id()), 1);

    // Same creator, second collection: still 1 unique creator.
    create_collection(&mut contract, &creator(), "c2", 10);
    assert_eq!(contract.get_app_creator_count(app_id()), 1);

    // Second distinct creator joins.
    create_collection(&mut contract, &other_creator(), "c3", 10);
    assert_eq!(contract.get_app_creator_count(app_id()), 2);
    assert!(contract.is_app_creator(app_id(), other_creator()));

    // Delete one of creator()'s collections — creator() still has another.
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::DeleteCollection {
            collection_id: "c1".to_string(),
        }))
        .unwrap();
    assert!(contract.is_app_creator(app_id(), creator()));
    assert_eq!(contract.get_app_creator_count(app_id()), 2);

    // Delete the last one for creator() — they drop out of the set.
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::DeleteCollection {
            collection_id: "c2".to_string(),
        }))
        .unwrap();
    assert!(!contract.is_app_creator(app_id(), creator()));
    assert_eq!(contract.get_app_creator_count(app_id()), 1);
}

#[test]
fn get_app_creators_paginated() {
    let mut contract = new_contract();
    register_app(&mut contract, None);

    create_collection(&mut contract, &creator(), "c1", 10);
    create_collection(&mut contract, &other_creator(), "c2", 10);

    let all = contract.get_app_creators(app_id(), None, None);
    assert_eq!(all.len(), 2);
    let page = contract.get_app_creators(app_id(), Some(1), Some(1));
    assert_eq!(page.len(), 1);
}

#[test]
fn app_owner_tracked_on_quick_mint_and_burn() {
    let mut contract = new_contract();
    register_app(&mut contract, None);

    // Quick mint deposits storage.
    testing_env!(context_with_deposit(creator(), 5_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::QuickMint {
            metadata: TokenMetadata {
                title: Some("hi".into()),
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
            },
            options: ScarceOptions {
                royalty: None,
                app_id: Some(app_id()),
                transferable: true,
                burnable: true,
            },
        }))
        .unwrap();

    assert!(contract.is_app_owner(app_id(), creator()));
    assert_eq!(contract.get_app_owner_count(app_id()), 1);

    // Burn the standalone token; owner drops out.
    let token_id = contract
        .scarces_per_owner
        .get(&creator())
        .unwrap()
        .iter()
        .next()
        .unwrap()
        .clone();
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::BurnScarce {
            token_id,
            collection_id: None,
        }))
        .unwrap();
    assert!(!contract.is_app_owner(app_id(), creator()));
    assert_eq!(contract.get_app_owner_count(app_id()), 0);
}

#[test]
fn app_owner_reindexed_on_transfer() {
    let mut contract = new_contract();
    register_app(&mut contract, None);

    testing_env!(context_with_deposit(creator(), 5_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::QuickMint {
            metadata: TokenMetadata {
                title: Some("t".into()),
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
            },
            options: ScarceOptions {
                royalty: None,
                app_id: Some(app_id()),
                transferable: true,
                burnable: true,
            },
        }))
        .unwrap();

    let token_id = contract
        .scarces_per_owner
        .get(&creator())
        .unwrap()
        .iter()
        .next()
        .unwrap()
        .clone();

    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .nft_transfer(buyer(), token_id, None, None)
        .unwrap();

    assert!(!contract.is_app_owner(app_id(), creator()));
    assert!(contract.is_app_owner(app_id(), buyer()));
    assert_eq!(contract.get_app_owner_count(app_id()), 1);
}

#[test]
fn app_owner_tracked_on_collection_mint() {
    let mut contract = new_contract();
    register_app(&mut contract, None);
    create_collection(&mut contract, &creator(), "col", 5);

    // MintFromCollection is creator-only; mint to buyer to verify owner indexing.
    testing_env!(context_with_deposit(creator(), 5_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MintFromCollection {
            collection_id: "col".to_string(),
            quantity: 2,
            receiver_id: Some(buyer()),
        }))
        .unwrap();

    assert!(contract.is_app_owner(app_id(), buyer()));
    assert!(!contract.is_app_owner(app_id(), creator()));
    assert_eq!(contract.get_app_owner_count(app_id()), 1);
}

#[test]
fn template_substitutes_app_placeholders() {
    let mut contract = new_contract();
    register_app(
        &mut contract,
        Some(r#"{"name":"Acme Store","icon":"https://acme/icon.png"}"#.to_string()),
    );
    create_collection(&mut contract, &creator(), "col", 5);

    let template = r#"{"title":"{app_name} #{seat_number}","extra":"{\"app\":\"{app_id}\",\"icon\":\"{app_icon}\"}"}"#;
    let meta = contract
        .generate_metadata_from_template(template, "col:1", 0, &buyer(), "col")
        .unwrap();

    assert_eq!(meta.title.unwrap(), "Acme Store #1");
    let extra = meta.extra.unwrap();
    assert!(extra.contains("\"app\":\"store.near\""));
    assert!(extra.contains("\"icon\":\"https://acme/icon.png\""));
}

#[test]
fn template_app_placeholders_empty_when_no_app() {
    let mut contract = new_contract();
    // Collection with no app_id.
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: CollectionConfig {
                collection_id: "noapp".to_string(),
                total_supply: 5,
                metadata_template: r#"{"title":"T"}"#.to_string(),
                price_near: U128(0),
                start_time: None,
                end_time: None,
                options: ScarceOptions {
                    royalty: None,
                    app_id: None,
                    transferable: true,
                    burnable: true,
                },
                renewable: false,
                revocation_mode: collections::RevocationMode::None,
                max_redeems: None,
                mint_mode: collections::MintMode::Open,
                metadata: None,
                max_per_wallet: None,
                start_price: None,
                allowlist_price: None,
            },
        }))
        .unwrap();

    let meta = contract
        .generate_metadata_from_template(
            r#"{"title":"X[{app_name}]","description":"{app_id}"}"#,
            "noapp:1",
            0,
            &buyer(),
            "noapp",
        )
        .unwrap();
    assert_eq!(meta.title.unwrap(), "X[]");
    assert_eq!(meta.description.unwrap(), "");
}
