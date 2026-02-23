use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    new_contract()
}

fn minimal_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"Token #{seat_number}"}"#.to_string(),
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
    }
}

/// Create a collection and mint a token into it, returning the token ID.
/// Transfer to owner() so they hold the token.
fn setup_collection_with_token(contract: &mut Contract, col_id: &str) -> String {
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config(col_id),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::MintFromCollection {
            collection_id: col_id.to_string(),
            quantity: 1,
            receiver_id: None,
        }))
        .unwrap();
    // First token in collection
    let token_id = format!("{}:1", col_id);
    // Transfer to owner so "owner()" is the token holder
    contract
        .execute(make_request(Action::TransferScarce {
            receiver_id: owner(),
            token_id: token_id.clone(),
            memo: None,
        }))
        .unwrap();
    token_id
}

const OFFER_AMOUNT: u128 = 5_000_000_000_000_000_000_000_000;

// ─── MakeCollectionOffer ────────────────────────────────────────────────────

#[test]
fn make_collection_offer_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config("offers"),
        }))
        .unwrap();

    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "offers".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    let offer = contract
        .get_collection_offer("offers".to_string(), buyer())
        .unwrap();
    assert_eq!(offer.amount, U128(OFFER_AMOUNT));
    assert_eq!(offer.buyer_id, buyer());
}

#[test]
fn make_collection_offer_nonexistent_collection_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1_000).build());

    let err = contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "nope".to_string(),
            amount: U128(1_000),
            expires_at: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn make_collection_offer_expired_fails() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config("offers2"),
        }))
        .unwrap();

    let past = 1_600_000_000_000_000_000u64; // before block_timestamp
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    let err = contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "offers2".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: Some(past),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// ─── CancelCollectionOffer ──────────────────────────────────────────────────

#[test]
fn cancel_collection_offer_happy() {
    let mut contract = setup_contract();
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config("canc"),
        }))
        .unwrap();

    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "canc".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .execute(make_request(Action::CancelCollectionOffer {
            collection_id: "canc".to_string(),
        }))
        .unwrap();

    assert!(contract
        .get_collection_offer("canc".to_string(), buyer())
        .is_none());
}

#[test]
fn cancel_collection_offer_not_found_fails() {
    let mut contract = setup_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::CancelCollectionOffer {
            collection_id: "nope".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// ─── AcceptCollectionOffer ──────────────────────────────────────────────────

#[test]
fn accept_collection_offer_happy() {
    let mut contract = setup_contract();
    let tid = setup_collection_with_token(&mut contract, "accol");

    // Buyer makes a collection-level offer
    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "accol".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    // Owner accepts with the specific token
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AcceptCollectionOffer {
            collection_id: "accol".to_string(),
            token_id: tid.clone(),
            buyer_id: buyer(),
        }))
        .unwrap();

    // Token transferred to buyer
    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, buyer());
    // Offer removed
    assert!(contract
        .get_collection_offer("accol".to_string(), buyer())
        .is_none());
}

#[test]
fn accept_collection_offer_wrong_owner_fails() {
    let mut contract = setup_contract();
    let tid = setup_collection_with_token(&mut contract, "accol2");

    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "accol2".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    // Creator is NOT the token owner (we transferred to owner())
    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::AcceptCollectionOffer {
            collection_id: "accol2".to_string(),
            token_id: tid,
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn accept_collection_offer_own_offer_fails() {
    let mut contract = setup_contract();
    let tid = setup_collection_with_token(&mut contract, "accol3");

    // Owner makes a collection offer and then tries to accept it
    testing_env!(context_with_deposit(owner(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "accol3".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(owner(), 1).build());
    let err = contract
        .execute(make_request(Action::AcceptCollectionOffer {
            collection_id: "accol3".to_string(),
            token_id: tid,
            buyer_id: owner(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn accept_collection_offer_expired_refunds() {
    let mut contract = setup_contract();
    let tid = setup_collection_with_token(&mut contract, "accol4");

    // Offer with imminent expiry
    let expires = 1_700_000_000_000_000_000u64 + 1_000_000_000; // 1 second from default
    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "accol4".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: Some(expires),
        }))
        .unwrap();

    // Advance time past expiry
    testing_env!(context_with_deposit(owner(), 1)
        .block_timestamp(1_700_000_000_000_000_000 + 10_000_000_000) // 10 seconds later
        .build());

    let err = contract
        .execute(make_request(Action::AcceptCollectionOffer {
            collection_id: "accol4".to_string(),
            token_id: tid,
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn accept_collection_offer_token_not_in_collection_fails() {
    let mut contract = setup_contract();
    // Create collection but use a token from a different collection
    testing_env!(context_with_deposit(creator(), 1).build());
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config("col_a"),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::CreateCollection {
            params: minimal_config("col_b"),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::MintFromCollection {
            collection_id: "col_b".to_string(),
            quantity: 1,
            receiver_id: None,
        }))
        .unwrap();
    let wrong_tid = "col_b:1".to_string();
    contract
        .execute(make_request(Action::TransferScarce {
            receiver_id: owner(),
            token_id: wrong_tid.clone(),
            memo: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(buyer(), OFFER_AMOUNT).build());
    contract
        .execute(make_request(Action::MakeCollectionOffer {
            collection_id: "col_a".to_string(),
            amount: U128(OFFER_AMOUNT),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(owner(), 1).build());
    let err = contract
        .execute(make_request(Action::AcceptCollectionOffer {
            collection_id: "col_a".to_string(),
            token_id: wrong_tid,
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(
        err,
        MarketplaceError::Unauthorized(_) | MarketplaceError::InvalidInput(_)
    ));
}
