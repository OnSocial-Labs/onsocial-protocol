use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

fn default_metadata(title: &str) -> scarce::types::TokenMetadata {
    scarce::types::TokenMetadata {
        title: Some(title.into()),
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

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn quick_mint(contract: &mut Contract, minter: &AccountId, title: &str) -> String {
    testing_env!(context(minter.clone()).build());
    let action = Action::QuickMint {
        metadata: default_metadata(title),
        options: default_options(),
    };
    let result = contract.execute(make_request(action)).unwrap();
    result.as_str().unwrap().to_string()
}

fn minimal_collection_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 5,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: default_options(),
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    }
}

// --- nft_total_supply ---

#[test]
fn nft_total_supply_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.nft_total_supply().0, 0);
}

#[test]
fn nft_total_supply_after_mints() {
    let mut contract = setup_contract();
    quick_mint(&mut contract, &buyer(), "A");
    quick_mint(&mut contract, &buyer(), "B");
    quick_mint(&mut contract, &creator(), "C");

    testing_env!(context(owner()).build());
    assert_eq!(contract.nft_total_supply().0, 3);
}

// --- nft_tokens ---

#[test]
fn nft_tokens_returns_all() {
    let mut contract = setup_contract();
    quick_mint(&mut contract, &buyer(), "A");
    quick_mint(&mut contract, &buyer(), "B");

    testing_env!(context(owner()).build());
    let tokens = contract.nft_tokens(None, None);
    assert_eq!(tokens.len(), 2);
    assert!(tokens.iter().all(|t| t.metadata.is_some()));
}

#[test]
fn nft_tokens_pagination() {
    let mut contract = setup_contract();
    for i in 0..5 {
        quick_mint(&mut contract, &buyer(), &format!("T{}", i));
    }
    testing_env!(context(owner()).build());

    let page1 = contract.nft_tokens(None, Some(2));
    assert_eq!(page1.len(), 2);

    let page2 = contract.nft_tokens(Some(U128(2)), Some(2));
    assert_eq!(page2.len(), 2);

    let page3 = contract.nft_tokens(Some(U128(4)), Some(2));
    assert_eq!(page3.len(), 1);
}

// --- nft_supply_for_owner ---

#[test]
fn nft_supply_for_owner_zero() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.nft_supply_for_owner(buyer()).0, 0);
}

#[test]
fn nft_supply_for_owner_counts_correctly() {
    let mut contract = setup_contract();
    quick_mint(&mut contract, &buyer(), "A");
    quick_mint(&mut contract, &buyer(), "B");
    quick_mint(&mut contract, &creator(), "C");

    testing_env!(context(owner()).build());
    assert_eq!(contract.nft_supply_for_owner(buyer()).0, 2);
    assert_eq!(contract.nft_supply_for_owner(creator()).0, 1);
}

// --- nft_tokens_for_owner ---

#[test]
fn nft_tokens_for_owner_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let tokens = contract.nft_tokens_for_owner(buyer(), None, None);
    assert!(tokens.is_empty());
}

#[test]
fn nft_tokens_for_owner_returns_owned() {
    let mut contract = setup_contract();
    let id1 = quick_mint(&mut contract, &buyer(), "A");
    let id2 = quick_mint(&mut contract, &buyer(), "B");
    quick_mint(&mut contract, &creator(), "C");

    testing_env!(context(owner()).build());
    let tokens = contract.nft_tokens_for_owner(buyer(), None, None);
    assert_eq!(tokens.len(), 2);
    let ids: Vec<_> = tokens.iter().map(|t| t.token_id.as_str()).collect();
    assert!(ids.contains(&id1.as_str()));
    assert!(ids.contains(&id2.as_str()));
}

#[test]
fn nft_tokens_for_owner_pagination() {
    let mut contract = setup_contract();
    for i in 0..5 {
        quick_mint(&mut contract, &buyer(), &format!("T{}", i));
    }
    testing_env!(context(owner()).build());

    let page1 = contract.nft_tokens_for_owner(buyer(), None, Some(2));
    assert_eq!(page1.len(), 2);

    let page2 = contract.nft_tokens_for_owner(buyer(), Some(U128(2)), Some(10));
    assert_eq!(page2.len(), 3);
}

// --- nft_supply_for_collection ---

#[test]
fn nft_supply_for_collection_zero() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(
        contract.nft_supply_for_collection("nonexistent".into()).0,
        0
    );
}

#[test]
fn nft_supply_for_collection_after_mint() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), minimal_collection_config("ecol"))
        .unwrap();

    // Mint via execute
    let action = Action::MintFromCollection {
        collection_id: "ecol".into(),
        quantity: 2,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();

    assert_eq!(contract.nft_supply_for_collection("ecol".into()).0, 2);
}

// --- nft_tokens_for_collection ---

#[test]
fn nft_tokens_for_collection_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let tokens = contract.nft_tokens_for_collection("nothere".into(), None, None);
    assert!(tokens.is_empty());
}

#[test]
fn nft_tokens_for_collection_returns_minted() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), minimal_collection_config("ecol2"))
        .unwrap();

    let action = Action::MintFromCollection {
        collection_id: "ecol2".into(),
        quantity: 3,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();

    let tokens = contract.nft_tokens_for_collection("ecol2".into(), None, None);
    assert_eq!(tokens.len(), 3);
    assert!(tokens[0].token_id.starts_with("ecol2:"));
}

#[test]
fn nft_tokens_for_collection_pagination() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), minimal_collection_config("ecol3"))
        .unwrap();

    let action = Action::MintFromCollection {
        collection_id: "ecol3".into(),
        quantity: 5,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();

    let page = contract.nft_tokens_for_collection("ecol3".into(), Some(U128(2)), Some(2));
    assert_eq!(page.len(), 2);
}
