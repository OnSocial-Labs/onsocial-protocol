//! Remaining ticket possibilities on `scarces-onsocial`.
//!
//! The rain-day flow lives in `ticket_lifecycle_test`. This file covers the
//! other product branches: sale window, pause, door staff, revoke, transfer
//! then refund, redeem-after-cancel, and non-renewable postpone.

use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

const COL: &str = "guest-show";
const PRICE: u128 = 1_000_000;
const REFUND: u128 = 500_000;
const T0_NS: u64 = 1_700_000_000_000_000_000;
const T0_MS: u64 = 1_700_000_000_000;
const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const DAY_MS: u64 = 24 * 60 * 60 * 1_000;

fn staff() -> near_sdk::AccountId {
    near_sdk::test_utils::accounts(3)
}

fn at(predecessor: near_sdk::AccountId, ts_ns: u64) -> near_sdk::test_utils::VMContextBuilder {
    let mut builder = context(predecessor);
    builder.block_timestamp(ts_ns);
    builder
}

fn at_deposit(
    predecessor: near_sdk::AccountId,
    ts_ns: u64,
    deposit: u128,
) -> near_sdk::test_utils::VMContextBuilder {
    let mut builder = context_with_deposit(predecessor, deposit);
    builder.block_timestamp(ts_ns);
    builder
}

fn ticket_config() -> CollectionConfig {
    CollectionConfig {
        collection_id: COL.to_string(),
        total_supply: 8,
        metadata_template: {
            let end = T0_MS + DAY_MS;
            let extra = near_sdk::serde_json::json!({
                "kind": "ticket",
                "eventEndsAt": end,
            });
            near_sdk::serde_json::json!({
                "title": "Guest #{seat_number}",
                "expires_at": end,
                "extra": extra.to_string(),
            })
            .to_string()
        },
        price_near: U128(PRICE),
        start_time: Some(T0_NS),
        end_time: Some(T0_NS + 30 * DAY_NS),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: true,
        revocation_mode: RevocationMode::None,
        max_redeems: Some(1),
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
        max_per_purchase: None,
        random_assignment: false,
    }
}

fn open_show(renewable: bool, revocation: RevocationMode) -> Contract {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    let mut cfg = ticket_config();
    cfg.renewable = renewable;
    cfg.revocation_mode = revocation;
    contract.create_collection(&creator(), cfg).unwrap();
    contract
}

fn buy(contract: &mut Contract, ts_ns: u64, quantity: u32) {
    testing_env!(at_deposit(buyer(), ts_ns, PRICE * quantity as u128).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: COL.into(),
            quantity,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap();
}

fn try_buy(
    contract: &mut Contract,
    who: near_sdk::AccountId,
    ts_ns: u64,
    quantity: u32,
) -> Result<near_sdk::serde_json::Value, MarketplaceError> {
    testing_env!(at_deposit(who, ts_ns, PRICE * quantity as u128).build());
    contract.execute(make_request(Action::PurchaseFromCollection {
        collection_id: COL.into(),
        quantity,
        max_price_per_token: U128(u128::MAX),
    }))
}

fn seat(n: u32) -> String {
    format!("{COL}:{n}")
}

fn cancel(contract: &mut Contract, unused: u128) {
    let pool = REFUND * unused;
    testing_env!(at_deposit(creator(), T0_NS, pool).build());
    contract
        .cancel_collection(
            &creator(),
            COL,
            U128(REFUND),
            Some(MIN_REFUND_DEADLINE_NS),
            pool,
        )
        .unwrap();
}

#[test]
fn ticket_sale_before_start_fails() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    let mut cfg = ticket_config();
    cfg.start_time = Some(T0_NS + DAY_NS);
    contract.create_collection(&creator(), cfg).unwrap();

    let err = try_buy(&mut contract, buyer(), T0_NS, 1).unwrap_err();
    assert!(matches!(
        err,
        MarketplaceError::Unauthorized(_) | MarketplaceError::InvalidState(_)
    ));
}

#[test]
fn ticket_sale_after_window_fails() {
    let mut contract = open_show(true, RevocationMode::None);
    let err = try_buy(&mut contract, buyer(), T0_NS + 31 * DAY_NS, 1).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ticket_pause_blocks_sale_resume_allows() {
    let mut contract = open_show(true, RevocationMode::None);
    testing_env!(at(creator(), T0_NS).build());
    contract.pause_collection(&creator(), COL).unwrap();

    let err = try_buy(&mut contract, buyer(), T0_NS, 1).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    testing_env!(at(creator(), T0_NS).build());
    contract.resume_collection(&creator(), COL).unwrap();
    buy(&mut contract, T0_NS, 1);
    assert_eq!(contract.get_collection(COL.into()).unwrap().minted_count, 1);
}

#[test]
fn ticket_double_redeem_fails() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);
    testing_env!(at(creator(), T0_NS).build());
    contract.redeem_token(&creator(), &seat(1), COL).unwrap();
    let err = contract
        .redeem_token(&creator(), &seat(1), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ticket_door_staff_can_redeem_stranger_cannot() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(creator(), T0_NS).build());
    contract.add_redeemer(&creator(), COL, staff()).unwrap();

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.redeem_token(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));

    testing_env!(at(staff(), T0_NS).build());
    contract.redeem_token(&staff(), &seat(1), COL).unwrap();
    assert_eq!(
        contract
            .get_collection(COL.into())
            .unwrap()
            .fully_redeemed_count,
        1
    );
}

#[test]
fn ticket_redeem_after_cancel_works_then_blocks_refund() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);
    cancel(&mut contract, 1);

    // Door is independent of cancel — unused ticket can still be scanned.
    testing_env!(at(creator(), T0_NS).build());
    contract.redeem_token(&creator(), &seat(1), COL).unwrap();

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    // Pool still holds the unused-at-cancel deposit until the window ends.
    assert_eq!(
        contract.get_collection(COL.into()).unwrap().refund_pool.0,
        REFUND
    );
}

#[test]
fn ticket_transfer_then_new_holder_claims() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(buyer(), T0_NS).build());
    contract
        .transfer(&buyer(), &staff(), &seat(1), None, None)
        .unwrap();
    assert_eq!(
        contract.scarces_by_id.get(&seat(1)).unwrap().owner_id,
        staff()
    );

    cancel(&mut contract, 1);

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));

    testing_env!(at(staff(), T0_NS).build());
    contract.claim_refund(&staff(), &seat(1), COL).unwrap();
    assert!(contract.scarces_by_id.get(&seat(1)).unwrap().refunded);
}

#[test]
fn ticket_refund_twice_fails() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);
    cancel(&mut contract, 1);

    testing_env!(at(buyer(), T0_NS).build());
    contract.claim_refund(&buyer(), &seat(1), COL).unwrap();
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ticket_revoked_cannot_redeem() {
    let mut contract = open_show(true, RevocationMode::Invalidate);
    buy(&mut contract, T0_NS, 1);
    testing_env!(at(creator(), T0_NS).build());
    contract
        .revoke_token(&creator(), &seat(1), COL, Some("no-show".into()))
        .unwrap();
    let err = contract
        .redeem_token(&creator(), &seat(1), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ticket_non_renewable_cannot_postpone() {
    let mut contract = open_show(false, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);
    testing_env!(at(creator(), T0_NS).build());
    let err = contract
        .renew_token(
            &creator(),
            &seat(1),
            COL,
            (T0_MS + 4 * DAY_MS) * NS_PER_MS,
        )
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    let err = contract
        .update_collection_template_expiry(&creator(), COL, T0_MS + 4 * DAY_MS)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ticket_all_redeemed_cancel_uses_empty_pool() {
    let mut contract = open_show(true, RevocationMode::None);
    buy(&mut contract, T0_NS, 1);
    testing_env!(at(creator(), T0_NS).build());
    contract.redeem_token(&creator(), &seat(1), COL).unwrap();

    testing_env!(at(creator(), T0_NS).build());
    contract
        .cancel_collection(
            &creator(),
            COL,
            U128(REFUND),
            Some(MIN_REFUND_DEADLINE_NS),
            0,
        )
        .unwrap();
    let col = contract.get_collection(COL.into()).unwrap();
    assert!(col.cancelled);
    assert_eq!(col.refund_pool.0, 0);

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}
