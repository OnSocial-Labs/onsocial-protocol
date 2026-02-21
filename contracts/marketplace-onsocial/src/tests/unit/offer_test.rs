use crate::tests::test_utils::*;
use crate::*;
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
        .internal_mint(token_id.to_string(), ctx, metadata, None)
        .unwrap();
}

// --- Make offer ---

#[test]
fn make_offer_stores_in_map() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap();

    let offer = contract
        .get_offer("t1".to_string(), buyer())
        .expect("Offer should exist");
    assert_eq!(offer.buyer_id, buyer());
    assert_eq!(offer.amount, 1_000_000_000_000_000_000_000_000);
}

#[test]
fn make_offer_on_own_token_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    let err = contract
        .internal_make_offer(&owner(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn make_offer_on_nonexistent_token_fails() {
    let mut contract = new_contract();

    let err = contract
        .internal_make_offer(&buyer(), "nope", 1_000_000_000_000_000_000_000_000, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn make_offer_expired_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    // Expiry in the past (block_timestamp from context is ~1.7e18)
    let err = contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, Some(1))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// --- Cancel offer ---

#[test]
fn cancel_offer_removes_from_map() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap();
    assert!(contract.get_offer("t1".to_string(), buyer()).is_some());

    contract.internal_cancel_offer(&buyer(), "t1").unwrap();
    assert!(contract.get_offer("t1".to_string(), buyer()).is_none());
}

#[test]
fn cancel_nonexistent_offer_fails() {
    let mut contract = new_contract();

    let err = contract
        .internal_cancel_offer(&buyer(), "t1")
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- Accept offer ---

#[test]
fn accept_offer_transfers_token() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap();

    contract
        .internal_accept_offer(&owner(), "t1", &buyer())
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

    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap();

    let err = contract
        .internal_accept_offer(&creator(), "t1", &buyer()) // creator is not owner
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn accept_nonexistent_offer_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    let err = contract
        .internal_accept_offer(&owner(), "t1", &buyer())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn accept_expired_offer_fails() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    // Set expires_at far in the future so make_offer succeeds
    let future = 2_000_000_000_000_000_000u64;
    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, Some(future))
        .unwrap();

    // Now advance time past expiry
    let mut ctx = context(owner());
    ctx.block_timestamp(future + 1);
    testing_env!(ctx.build());

    let err = contract
        .internal_accept_offer(&owner(), "t1", &buyer())
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

// --- Replacing an offer ---

#[test]
fn new_offer_replaces_old() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    contract
        .internal_make_offer(&buyer(), "t1", 1_000_000_000_000_000_000_000_000, None)
        .unwrap();
    contract
        .internal_make_offer(&buyer(), "t1", 2_000_000_000_000_000_000_000_000, None)
        .unwrap();

    let offer = contract.get_offer("t1".to_string(), buyer()).unwrap();
    assert_eq!(offer.amount, 2_000_000_000_000_000_000_000_000);
}
