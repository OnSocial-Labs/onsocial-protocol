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
fn make_offer_failure_restores_prepaid_balance() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");

    let prepaid = 5_000_000_000_000_000_000_000_000u128;
    contract.user_storage.insert(
        owner(),
        UserStorageBalance {
            balance: U128(prepaid),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    // No attached deposit → draws prepaid; offer on own token must fail and restore.
    testing_env!(context(owner()).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
    assert_eq!(
        contract.user_storage.get(&owner()).unwrap().balance.0,
        prepaid,
        "failed offer must restore drawn prepaid balance"
    );
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

    let token = contract.scarces_by_id.get("t1").unwrap();
    assert_eq!(token.owner_id, buyer());
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

    testing_env!(context_with_deposit(creator(), 1).build());
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

    let future = 2_000_000_000_000_000_000u64;
    testing_env!(context_with_deposit(buyer(), 1_000_000_000_000_000_000_000_000).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(1_000_000_000_000_000_000_000_000),
            expires_at: Some(future),
        }))
        .unwrap();

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

const OFFER_YOCTO: u128 = 1_000_000_000_000_000_000_000_000;

fn offer_account(i: u32) -> AccountId {
    format!("ob{i}.near").parse().unwrap()
}

fn make_token_offer(
    contract: &mut Contract,
    who: AccountId,
    token_id: &str,
    amount: u128,
    expires_at: Option<u64>,
) {
    testing_env!(context_with_deposit(who, amount).build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: token_id.to_string(),
            amount: U128(amount),
            expires_at,
        }))
        .unwrap();
}

fn fill_token_offers(contract: &mut Contract, token_id: &str, n: u32) {
    for i in 0..n {
        make_token_offer(contract, offer_account(i), token_id, OFFER_YOCTO, None);
    }
}

#[test]
fn make_offer_rejects_eleventh_new_buyer() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    fill_token_offers(&mut contract, "t1", MAX_TOKEN_OFFERS);

    testing_env!(context_with_deposit(offer_account(10), OFFER_YOCTO).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(OFFER_YOCTO),
            expires_at: None,
        }))
        .unwrap_err();
    match err {
        MarketplaceError::InvalidState(msg) => {
            assert_eq!(msg, "This scarce already has 10 offers.");
        }
        other => panic!("expected full book, got {other:?}"),
    }
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        MAX_TOKEN_OFFERS as usize
    );
}

#[test]
fn make_offer_same_buyer_can_replace_when_book_is_full() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    fill_token_offers(&mut contract, "t1", MAX_TOKEN_OFFERS);

    let first = offer_account(0);
    make_token_offer(
        &mut contract,
        first.clone(),
        "t1",
        2_000_000_000_000_000_000_000_000,
        None,
    );
    let offer = contract.get_offer("t1".to_string(), first).unwrap();
    assert_eq!(offer.amount, U128(2_000_000_000_000_000_000_000_000));
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        MAX_TOKEN_OFFERS as usize
    );
}

#[test]
fn make_offer_sweeps_expired_and_frees_a_slot() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    fill_token_offers(&mut contract, "t1", MAX_TOKEN_OFFERS - 1);

    let expiring = offer_account(9);
    let future = 2_000_000_000_000_000_000u64;
    make_token_offer(
        &mut contract,
        expiring.clone(),
        "t1",
        OFFER_YOCTO,
        Some(future),
    );
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        MAX_TOKEN_OFFERS as usize
    );

    let mut ctx = context_with_deposit(offer_account(10), OFFER_YOCTO);
    ctx.block_timestamp(future + 1);
    testing_env!(ctx.build());
    contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(OFFER_YOCTO),
            expires_at: None,
        }))
        .unwrap();

    assert!(contract.get_offer("t1".to_string(), expiring).is_none());
    assert!(
        contract
            .get_offer("t1".to_string(), offer_account(10))
            .is_some()
    );
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        MAX_TOKEN_OFFERS as usize
    );
}

#[test]
fn accept_offer_refunds_other_live_and_expired_offers() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    make_token_offer(&mut contract, buyer(), "t1", OFFER_YOCTO, None);

    let future = 2_000_000_000_000_000_000u64;
    make_token_offer(&mut contract, creator(), "t1", OFFER_YOCTO, Some(future));
    make_token_offer(&mut contract, offer_account(3), "t1", OFFER_YOCTO, None);

    let mut ctx = context_with_deposit(owner(), 1);
    ctx.block_timestamp(future + 1);
    testing_env!(ctx.build());
    contract
        .execute(make_request(Action::AcceptOffer {
            token_id: "t1".to_string(),
            buyer_id: buyer(),
        }))
        .unwrap();

    assert_eq!(contract.scarces_by_id.get("t1").unwrap().owner_id, buyer());
    assert!(contract.get_offer("t1".to_string(), buyer()).is_none());
    assert!(contract.get_offer("t1".to_string(), creator()).is_none());
    assert!(
        contract
            .get_offer("t1".to_string(), offer_account(3))
            .is_none()
    );
}

#[test]
fn purchase_native_refunds_open_token_offers() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    testing_env!(context(owner()).build());
    contract
        .list_native_scarce(&owner(), "t1", U128(5_000), None)
        .unwrap();
    make_token_offer(&mut contract, buyer(), "t1", OFFER_YOCTO, None);
    make_token_offer(&mut contract, creator(), "t1", OFFER_YOCTO, None);

    testing_env!(context_with_deposit(offer_account(7), 10_000).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: "t1".to_string(),
        }))
        .unwrap();

    assert_eq!(
        contract.scarces_by_id.get("t1").unwrap().owner_id,
        offer_account(7)
    );
    assert!(contract.get_offer("t1".to_string(), buyer()).is_none());
    assert!(contract.get_offer("t1".to_string(), creator()).is_none());
}

#[test]
fn delist_does_not_refund_token_offers() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    testing_env!(context(owner()).build());
    contract
        .list_native_scarce(&owner(), "t1", U128(5_000), None)
        .unwrap();
    make_token_offer(&mut contract, buyer(), "t1", OFFER_YOCTO, None);

    testing_env!(context(owner()).build());
    contract.delist_native_scarce(&owner(), "t1").unwrap();
    assert!(contract.get_offer("t1".to_string(), buyer()).is_some());
}

#[test]
fn grandfathered_overfull_book_blocks_new_buyers_until_under_cap() {
    let mut contract = new_contract();
    mint_for_offer(&mut contract, &owner(), "t1");
    let now = 1_700_000_000_000_000_000u64;
    for i in 0..(MAX_TOKEN_OFFERS + 1) {
        let who = offer_account(i);
        contract.offers.insert(
            format!("t1\0{who}"),
            Offer {
                buyer_id: who,
                amount: U128(OFFER_YOCTO),
                expires_at: None,
                created_at: now,
            },
        );
    }

    testing_env!(context_with_deposit(offer_account(20), OFFER_YOCTO).build());
    let err = contract
        .execute(make_request(Action::MakeOffer {
            token_id: "t1".to_string(),
            amount: U128(OFFER_YOCTO),
            expires_at: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        (MAX_TOKEN_OFFERS + 1) as usize
    );

    make_token_offer(
        &mut contract,
        offer_account(0),
        "t1",
        2_000_000_000_000_000_000_000_000,
        None,
    );
    assert_eq!(
        contract
            .get_offers_for_token("t1".to_string(), None, Some(20))
            .len(),
        (MAX_TOKEN_OFFERS + 1) as usize
    );
}
