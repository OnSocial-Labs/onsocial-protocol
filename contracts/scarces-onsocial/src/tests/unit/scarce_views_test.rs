use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn redeemable_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 5,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: default_options(),
        renewable: false,
        revocation_mode: RevocationMode::Invalidate,
        max_redeems: Some(2),
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    }
}

fn mint_collection_token(contract: &mut Contract, collection_id: &str) -> String {
    testing_env!(context(creator()).build());
    let action = Action::MintFromCollection {
        collection_id: collection_id.into(),
        quantity: 1,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();
    let col = contract.collections.get(collection_id).unwrap();
    format!("{}:{}", collection_id, col.minted_count)
}

// --- is_token_valid ---

#[test]
fn is_token_valid_standalone() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());
    let action = Action::QuickMint {
        metadata: scarce::types::TokenMetadata {
            title: Some("Valid".into()),
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
        options: default_options(),
    };
    let token_id = contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();
    assert!(contract.is_token_valid(token_id));
}

#[test]
fn is_token_valid_nonexistent_returns_false() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(!contract.is_token_valid("nothere".into()));
}

#[test]
fn is_token_valid_revoked_returns_false() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), redeemable_config("rcol"))
        .unwrap();
    let token_id = mint_collection_token(&mut contract, "rcol");

    // Revoke: soft revocation
    let action = Action::RevokeToken {
        token_id: token_id.clone(),
        collection_id: "rcol".into(),
        memo: None,
    };
    testing_env!(context_with_deposit(creator(), 1).build());
    contract.execute(make_request(action)).unwrap();

    assert!(!contract.is_token_valid(token_id));
}

// --- is_token_revoked ---

#[test]
fn is_token_revoked_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.is_token_revoked("bad".into()).is_none());
}

#[test]
fn is_token_revoked_false_for_active() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), redeemable_config("rcol2"))
        .unwrap();
    let token_id = mint_collection_token(&mut contract, "rcol2");

    assert_eq!(contract.is_token_revoked(token_id), Some(false));
}

// --- is_token_redeemed ---

#[test]
fn is_token_redeemed_false_initially() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), redeemable_config("rcol3"))
        .unwrap();
    let token_id = mint_collection_token(&mut contract, "rcol3");

    assert_eq!(contract.is_token_redeemed(token_id), Some(false));
}

#[test]
fn is_token_redeemed_after_max_redeems() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), redeemable_config("rcol4"))
        .unwrap();
    let token_id = mint_collection_token(&mut contract, "rcol4");

    // Redeem 2 times (max_redeems=2)
    for _ in 0..2 {
        testing_env!(context_with_deposit(creator(), 1).build());
        let action = Action::RedeemToken {
            token_id: token_id.clone(),
            collection_id: "rcol4".into(),
        };
        contract.execute(make_request(action)).unwrap();
    }

    assert_eq!(contract.is_token_redeemed(token_id), Some(true));
}

// --- get_redeem_info ---

#[test]
fn get_redeem_info_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_redeem_info("nothere".into()).is_none());
}

#[test]
fn get_redeem_info_returns_correct_data() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .create_collection(&creator(), redeemable_config("rcol5"))
        .unwrap();
    let token_id = mint_collection_token(&mut contract, "rcol5");

    // Redeem once
    testing_env!(context_with_deposit(creator(), 1).build());
    let action = Action::RedeemToken {
        token_id: token_id.clone(),
        collection_id: "rcol5".into(),
    };
    contract.execute(make_request(action)).unwrap();

    let info = contract.get_redeem_info(token_id).unwrap();
    assert_eq!(info.redeem_count, 1);
    assert_eq!(info.max_redeems, Some(2));
}

// --- get_token_status ---

#[test]
fn get_token_status_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_token_status("nothere".into()).is_none());
}

#[test]
fn get_token_status_active_token() {
    let mut contract = setup_contract();
    testing_env!(context(buyer()).build());
    let action = Action::QuickMint {
        metadata: scarce::types::TokenMetadata {
            title: Some("Status".into()),
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
        options: default_options(),
    };
    let token_id = contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string();

    let status = contract.get_token_status(token_id).unwrap();
    assert!(status.is_valid);
    assert!(!status.is_revoked);
    assert!(!status.is_expired);
    assert!(!status.is_fully_redeemed);
    assert_eq!(status.owner_id, buyer());
}
