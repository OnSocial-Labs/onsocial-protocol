//! Unit tests for intents-onsocial.

use super::*;
use near_sdk::test_utils::{VMContextBuilder, accounts};
use near_sdk::{NearToken, testing_env};

fn ctx(predecessor: AccountId, deposit_yocto: u128) -> VMContextBuilder {
    let mut b = VMContextBuilder::new();
    b.current_account_id(accounts(0))
        .predecessor_account_id(predecessor)
        .attached_deposit(NearToken::from_yoctonear(deposit_yocto))
        .block_timestamp(1_700_000_000_000_000_000); // 2023-11-14
    b
}

fn good_input(bounty_yocto: u128, deadline_ms_from_now: u64) -> OfferInput {
    let now_ms = 1_700_000_000_000_000_000u64 / 1_000_000;
    OfferInput {
        kind: OfferKind::BoostViews {
            post_path: "alice.near/post/123".to_string(),
            target_views: 1000,
        },
        bounty: U128(bounty_yocto),
        deadline_ms: U64(now_ms + deadline_ms_from_now),
    }
}

fn fresh() -> OnsocialIntents {
    testing_env!(ctx(accounts(0), 0).build());
    OnsocialIntents::new(accounts(0))
}

#[test]
fn create_offer_locks_escrow_and_emits_event() {
    let mut c = fresh();
    let bounty = 1_000_000_000_000_000_000_000_000u128; // 1 NEAR
    let deposit = bounty + STORAGE_PER_OFFER;

    testing_env!(ctx(accounts(1), deposit).build());
    let id = c.create_offer(good_input(bounty, 60_000)).unwrap();
    assert_eq!(id.0, 1);

    let stats = c.get_stats();
    assert_eq!(stats.escrow_locked.0, bounty);
    assert_eq!(stats.next_offer_id.0, 2);
    assert_eq!(stats.total_offers.0, 1);

    let o = c.get_offer(U64(1)).unwrap();
    assert_eq!(o.creator, accounts(1));
    assert_eq!(o.status, OfferStatus::Open);
    assert_eq!(o.bounty, bounty);
}

#[test]
fn create_offer_with_insufficient_deposit_fails() {
    let mut c = fresh();
    let bounty = 1_000_000_000_000_000_000_000_000u128;
    // Attach exactly bounty (forgot the storage portion).
    testing_env!(ctx(accounts(1), bounty).build());
    let err = c.create_offer(good_input(bounty, 60_000)).unwrap_err();
    matches!(err, IntentError::InsufficientDeposit { .. });
    assert_eq!(c.get_stats().escrow_locked.0, 0);
}

#[test]
fn create_offer_with_bounty_below_minimum_fails() {
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO - 1;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    assert!(matches!(
        c.create_offer(good_input(bounty, 60_000)).unwrap_err(),
        IntentError::InvalidInput(_)
    ));
}

#[test]
fn create_offer_with_short_deadline_fails() {
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO * 2;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    // 1ms deadline -> below MIN_DEADLINE_NS / 1_000_000 = 60s
    let err = c.create_offer(good_input(bounty, 1)).unwrap_err();
    assert!(matches!(err, IntentError::InvalidInput(_)));
}

#[test]
fn cancel_before_deadline_by_non_creator_fails() {
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO * 2;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    c.create_offer(good_input(bounty, 60_000)).unwrap();

    testing_env!(ctx(accounts(2), 0).build());
    assert!(matches!(
        c.cancel_offer(U64(1)).err().unwrap(),
        IntentError::Unauthorized(_)
    ));
}

#[test]
fn cancel_before_deadline_by_creator_marks_cancelled() {
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO * 2;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    c.create_offer(good_input(bounty, 60_000)).unwrap();

    testing_env!(ctx(accounts(1), 0).build());
    let _ = c.cancel_offer(U64(1)).unwrap();
    assert_eq!(c.get_offer(U64(1)).unwrap().status, OfferStatus::Cancelled);
    assert_eq!(c.get_stats().escrow_locked.0, 0);
}

#[test]
fn cancel_after_deadline_by_anyone_marks_expired() {
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO * 2;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    c.create_offer(good_input(bounty, 120_000)).unwrap();

    // Jump past the 120s deadline by 1s.
    let mut b = ctx(accounts(2), 0);
    b.block_timestamp(1_700_000_000_000_000_000 + 121 * 1_000_000_000);
    testing_env!(b.build());

    let _ = c.cancel_offer(U64(1)).unwrap();
    assert_eq!(c.get_offer(U64(1)).unwrap().status, OfferStatus::Expired);
}

#[test]
fn cancel_unknown_offer_fails() {
    let mut c = fresh();
    testing_env!(ctx(accounts(1), 0).build());
    assert!(matches!(
        c.cancel_offer(U64(999)).err().unwrap(),
        IntentError::NotFound
    ));
}

#[test]
fn claim_with_unknown_oracle_key_rejected() {
    use near_sdk::json_types::{Base64VecU8, U64 as JU64};
    let mut c = fresh();
    let bounty = MIN_BOUNTY_YOCTO * 2;
    testing_env!(ctx(accounts(1), bounty + STORAGE_PER_OFFER).build());
    c.create_offer(good_input(bounty, 60_000)).unwrap();

    testing_env!(ctx(accounts(2), 0).build());
    let bad = crate::OracleAuth {
        public_key: "ed25519:11111111111111111111111111111111".parse().unwrap(),
        nonce: JU64(1),
        expires_at_ms: JU64(0),
        signature: Base64VecU8(vec![0u8; 64]),
    };
    let err = c
        .claim_offer(U64(1), accounts(2), "deadbeef".into(), bad)
        .err()
        .unwrap();
    assert!(matches!(err, IntentError::AuthFailed(_)));
}

#[test]
fn add_oracle_requires_owner_and_one_yocto() {
    let mut c = fresh();
    let key: PublicKey = "ed25519:11111111111111111111111111111111".parse().unwrap();

    // Not owner.
    testing_env!(ctx(accounts(1), 1).build());
    assert!(matches!(
        c.add_oracle_pk(key.clone()).unwrap_err(),
        IntentError::Unauthorized(_)
    ));

    // Owner but no 1y.
    testing_env!(ctx(accounts(0), 0).build());
    assert!(matches!(
        c.add_oracle_pk(key.clone()).unwrap_err(),
        IntentError::InvalidInput(_)
    ));

    // Owner + 1y -> OK.
    testing_env!(ctx(accounts(0), 1).build());
    c.add_oracle_pk(key.clone()).unwrap();
    assert_eq!(c.list_oracle_pks().len(), 1);
}

fn usdc() -> AccountId {
    "usdc.testnet".parse().unwrap()
}
fn evil_ft() -> AccountId {
    "evil.testnet".parse().unwrap()
}

fn allowlist_usdc(c: &mut OnsocialIntents) {
    testing_env!(ctx(accounts(0), 1).build());
    c.add_accepted_ft(usdc(), U128(1), U128(10_000_000_000))
        .unwrap();
}

fn good_ft_msg(bounty: u128, deadline_ms_from_now: u64) -> String {
    let now_ms = 1_700_000_000_000_000_000u64 / 1_000_000;
    near_sdk::serde_json::to_string(&OfferInput {
        kind: OfferKind::BoostViews {
            post_path: "alice.near/post/1".into(),
            target_views: 1000,
        },
        bounty: U128(bounty),
        deadline_ms: U64(now_ms + deadline_ms_from_now),
    })
    .unwrap()
}

#[test]
fn ft_on_transfer_creates_offer_when_allowlisted() {
    let mut c = fresh();
    allowlist_usdc(&mut c);

    // Predecessor = the FT contract itself.
    testing_env!(ctx(usdc(), 0).build());
    let res = c.ft_on_transfer(
        accounts(1),
        U128(5_000_000),
        good_ft_msg(5_000_000, 600_000),
    );
    match res {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 0, "should consume all"),
        _ => panic!("expected Value, got Promise"),
    }
    let o = c.get_offer(U64(1)).unwrap();
    assert_eq!(o.bounty, 5_000_000);
    assert_eq!(o.bounty_token, Some(usdc()));
    assert_eq!(o.creator, accounts(1));
    assert_eq!(c.get_ft_escrow_locked(usdc()).0, 5_000_000);
    // NEAR escrow untouched.
    assert_eq!(c.get_stats().escrow_locked.0, 0);
}

#[test]
fn ft_on_transfer_rejects_unallowlisted_token() {
    let mut c = fresh();
    allowlist_usdc(&mut c);

    testing_env!(ctx(evil_ft(), 0).build());
    let res = c.ft_on_transfer(
        accounts(1),
        U128(5_000_000),
        good_ft_msg(5_000_000, 600_000),
    );
    match res {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 5_000_000),
        _ => panic!("expected Value"),
    }
    assert!(c.get_offer(U64(1)).is_none());
}

#[test]
fn ft_on_transfer_rejects_bad_msg() {
    let mut c = fresh();
    allowlist_usdc(&mut c);

    testing_env!(ctx(usdc(), 0).build());
    let res = c.ft_on_transfer(accounts(1), U128(5_000_000), "not json".into());
    match res {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 5_000_000),
        _ => panic!("expected Value"),
    }
    assert!(c.get_offer(U64(1)).is_none());
}

#[test]
fn ft_on_transfer_rejects_amount_mismatch() {
    let mut c = fresh();
    allowlist_usdc(&mut c);

    testing_env!(ctx(usdc(), 0).build());
    // msg declares 5M but token contract delivered 1M.
    let res = c.ft_on_transfer(
        accounts(1),
        U128(1_000_000),
        good_ft_msg(5_000_000, 600_000),
    );
    match res {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 1_000_000),
        _ => panic!("expected Value"),
    }
    assert!(c.get_offer(U64(1)).is_none());
}

#[test]
fn ft_on_transfer_rejects_below_min() {
    let mut c = fresh();
    allowlist_usdc(&mut c); // min=1, max=10G

    testing_env!(ctx(usdc(), 0).build());
    let res = c.ft_on_transfer(accounts(1), U128(0), good_ft_msg(0, 600_000));
    match res {
        near_sdk::PromiseOrValue::Value(refund) => assert_eq!(refund.0, 0),
        _ => panic!("expected Value"),
    }
    assert!(c.get_offer(U64(1)).is_none());
}

#[test]
fn add_accepted_ft_requires_owner_and_one_yocto() {
    let mut c = fresh();
    // Not owner.
    testing_env!(ctx(accounts(1), 1).build());
    assert!(matches!(
        c.add_accepted_ft(usdc(), U128(1), U128(100)).unwrap_err(),
        IntentError::Unauthorized(_)
    ));
    // Owner without 1y.
    testing_env!(ctx(accounts(0), 0).build());
    assert!(matches!(
        c.add_accepted_ft(usdc(), U128(1), U128(100)).unwrap_err(),
        IntentError::InvalidInput(_)
    ));
    // Owner + 1y.
    testing_env!(ctx(accounts(0), 1).build());
    c.add_accepted_ft(usdc(), U128(1), U128(100)).unwrap();
    assert_eq!(c.list_accepted_fts().len(), 1);
}

#[test]
fn add_accepted_ft_rejects_bad_range() {
    let mut c = fresh();
    testing_env!(ctx(accounts(0), 1).build());
    assert!(matches!(
        c.add_accepted_ft(usdc(), U128(100), U128(50)).unwrap_err(),
        IntentError::InvalidInput(_)
    ));
    assert!(matches!(
        c.add_accepted_ft(usdc(), U128(0), U128(100)).unwrap_err(),
        IntentError::InvalidInput(_)
    ));
}

#[test]
fn add_accepted_ft_rejects_duplicate() {
    let mut c = fresh();
    allowlist_usdc(&mut c);
    testing_env!(ctx(accounts(0), 1).build());
    assert!(matches!(
        c.add_accepted_ft(usdc(), U128(1), U128(100)).unwrap_err(),
        IntentError::InvalidInput(_)
    ));
}

#[test]
fn cancel_ft_offer_paths_through_ft_branch() {
    let mut c = fresh();
    allowlist_usdc(&mut c);

    testing_env!(ctx(usdc(), 0).build());
    let _ = c.ft_on_transfer(
        accounts(1),
        U128(5_000_000),
        good_ft_msg(5_000_000, 600_000),
    );

    // Creator cancels. Predecessor = creator.
    testing_env!(ctx(accounts(1), 0).build());
    let _ = c.cancel_offer(U64(1)).unwrap();
    // Offer marked Cancelled; ft_escrow_locked debited optimistically.
    let o = c.get_offer(U64(1)).unwrap();
    assert_eq!(o.status, OfferStatus::Cancelled);
    assert_eq!(c.get_ft_escrow_locked(usdc()).0, 0);
}
