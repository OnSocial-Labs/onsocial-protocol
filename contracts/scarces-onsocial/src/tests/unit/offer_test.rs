use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn mint_for_offer(contract: &mut Contract, token_owner: &AccountId, token_id: &str) {
    let ctx = MintContext {
        owner_id: token_owner.clone(),
        creator_id: token_owner.clone(),
        minter_id: token_owner.clone(),
    };
    let metadata = TokenMetadata {
        title: Some("Offer Target".to_string()),
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
    };
    contract
        .mint(token_id.to_string(), ctx, metadata, None)
        .unwrap();
}

// --- Make offer ---

#[test]
fn make_offer_stores_in_map() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    let offer = contract
        .get_offer("t1".to_string(), buyer())
        .expect("Offer should exist");
    assert_eq!(offer.buyer_id, buyer());
    assert_eq!(offer.amount, U128(1_000_000_000_000_000_000_000_000));
}

#[test]
fn make_offer_on_own_token_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(owner(), 1_000_000_000_000_000_000_000_000).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn make_offer_on_nonexistent_token_fails() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "nope".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn make_offer_expired_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    // Expiry in the past (block_timestamp from context is ~1.7e18)
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: Some(1),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Cancel offer ---

#[test]
fn cancel_offer_removes_from_map() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();
    assert!(contract.get_offer("t1".to_string(), buyer()).is_some());

    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .execute(make_request(Action::CancelOffer {
            token_id: "t1".to_string(),
        }))
        .unwrap();
    assert!(contract.get_offer("t1".to_string(), buyer()).is_none());
}

#[test]
fn cancel_nonexistent_offer_fails() {
    let mut contract = new_contract();

    testing_env!(context_with_deposit(buyer(), 1).build());
    let err = contract
        .execute(make_request(Action::CancelOffer {
            token_id: "t1".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- Accept offer ---

#[test]
fn accept_offer_transfers_token() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AcceptOffer {
            token_id: "t1".to_string(),
            buyer_id: buyer(),
        }))
        .unwrap();

    // Token transferred to buyer
    let token = contract.scarces_by_id.get("t1").unwrap();
    assert_eq!(token.owner_id, buyer());
    // Offer removed
    assert!(contract.get_offer("t1".to_string(), buyer()).is_none());
}

#[test]
fn accept_offer_wrong_owner_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(creator(), 1).build()); // creator is not owner
    let err = contract
        .execute(make_request(Action::AcceptOffer {
            token_id: "t1".to_string(),
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn accept_nonexistent_offer_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(owner(), 1).build());
    let err = contract
        .execute(make_request(Action::AcceptOffer {
            token_id: "t1".to_string(),
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn accept_expired_offer_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    // Set expires_at far in the future so make_offer succeeds
    let future = 2_000_000_000_000_000_000u64;
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: Some(future),
        }))
        .unwrap();

    // Now advance time past expiry
    let mut ctx = context_with_deposit(owner(), 1);
    ctx.block_timestamp(future + 1);
    testing_env!(ctx.build());

    let err = contract
        .execute(make_request(Action::AcceptOffer {
            token_id: "t1".to_string(),
            buyer_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Replacing an offer ---

#[test]
fn new_offer_replaces_old() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    testing_env!(context_with_deposit(buyer(), 2_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(2_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap();

    let offer = contract.get_offer("t1".to_string(), buyer()).unwrap();
    assert_eq!(offer.amount, U128(2_000_000_000_000_000_000_000_000));
}
