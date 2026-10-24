//! Guest ticket lifecycle — postpone while the show is still open, then cancel.
//!
//! Three clocks:
//! - sale window (`start_time` / `end_time`, ns) — a close on the event-end
//!   minute moves with postpone; an earlier close stays
//! - door access (`metadata.expires_at`, ms) — postpone moves the collection end
//!   while that end is still ahead
//! - refund claim window (starts only after `cancel_collection`)
//!
//! Postpone never refunds. Refunds are holder claims against the cancel pool.
//! Fully redeemed seats are excluded from that pool.

use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

const COL: &str = "guest-show";
const PRICE: u128 = 1_000_000;
const REFUND: u128 = 500_000;

/// Default test_utils timestamp.
const T0_NS: u64 = 1_700_000_000_000_000_000;
const T0_MS: u64 = 1_700_000_000_000;
const DAY_NS: u64 = 24 * 60 * 60 * 1_000_000_000;
const DAY_MS: u64 = 24 * 60 * 60 * 1_000;

fn original_end_ms() -> u64 {
    T0_MS + DAY_MS
}

fn postponed_end_ms() -> u64 {
    T0_MS + 4 * DAY_MS
}

fn postponed_end_ns() -> u64 {
    postponed_end_ms() * NS_PER_MS
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
            let end = original_end_ms();
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

fn seat(n: u32) -> String {
    format!("{COL}:{n}")
}

/// Rain day → postpone → cancel → claim before and after the new date.
#[test]
fn guest_ticket_rain_day_postpone_cancel_and_refunds() {
    let mut contract = new_contract();

    // --- Create the show + sale window ---
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();

    // --- Sell four seats ---
    buy(&mut contract, T0_NS, 4);
    let col = contract.get_collection(COL.into()).unwrap();
    assert_eq!(col.minted_count, 4);
    assert_eq!(
        contract
            .scarces_by_id
            .get(&seat(1))
            .unwrap()
            .metadata
            .expires_at,
        Some(original_end_ms())
    );

    // --- Door: admit one guest before the storm ---
    testing_env!(at(creator(), T0_NS).build());
    contract.redeem_token(&creator(), &seat(1), COL).unwrap();
    assert_eq!(
        contract
            .get_collection(COL.into())
            .unwrap()
            .fully_redeemed_count,
        1
    );

    // --- Postpone while the original end is still ahead ---
    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();
    assert_eq!(
        contract.collections.get(COL).unwrap().event_ends_at,
        Some(postponed_end_ms())
    );
    let meta: near_sdk::serde_json::Value = near_sdk::serde_json::from_str(
        contract
            .collections
            .get(COL)
            .unwrap()
            .metadata
            .as_deref()
            .unwrap(),
    )
    .unwrap();
    assert_eq!(meta["eventEndsAtPrevious"], original_end_ms());
    assert_eq!(
        contract
            .scarces_by_id
            .get(&seat(2))
            .unwrap()
            .metadata
            .expires_at,
        Some(original_end_ms())
    );

    let template: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(&contract.collections.get(COL).unwrap().metadata_template)
            .unwrap();
    assert_eq!(template["expires_at"], postponed_end_ms());
    let extra: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(template["extra"].as_str().unwrap()).unwrap();
    assert_eq!(extra["eventEndsAt"], postponed_end_ms());

    // Original date has passed; the new end keeps unused seats open.
    let after_original = T0_NS + DAY_NS + 1;
    testing_env!(at(creator(), after_original).build());
    contract.redeem_token(&creator(), &seat(2), COL).unwrap();
    assert_eq!(
        contract
            .get_collection(COL.into())
            .unwrap()
            .fully_redeemed_count,
        2
    );

    // New sale after postpone inherits the new event end.
    buy(&mut contract, after_original, 1);
    assert_eq!(
        contract
            .scarces_by_id
            .get(&seat(5))
            .unwrap()
            .metadata
            .expires_at,
        Some(postponed_end_ms())
    );

    // --- Show is cancelled; refund pool covers unused seats only ---
    // minted 5 − fully redeemed 2 = 3 refundable (:3, :4, :5)
    let cancel_at = after_original + 1;
    let pool = REFUND * 3;
    testing_env!(at_deposit(creator(), cancel_at, pool).build());
    contract
        .cancel_collection(
            &creator(),
            COL,
            U128(REFUND),
            Some(MIN_REFUND_DEADLINE_NS),
            pool,
        )
        .unwrap();

    let col = contract.get_collection(COL.into()).unwrap();
    assert!(col.cancelled);
    assert_eq!(col.refund_pool.0, pool);
    assert_eq!(col.refund_per_token.0, REFUND);

    // Sales stop.
    testing_env!(at_deposit(buyer(), cancel_at, PRICE).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: COL.into(),
            quantity: 1,
            max_price_per_token: U128(u128::MAX),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    // Used tickets cannot claim — guest already walked in.
    testing_env!(at(buyer(), cancel_at).build());
    for n in [1u32, 2] {
        let err = contract.claim_refund(&buyer(), &seat(n), COL).unwrap_err();
        assert!(
            matches!(err, MarketplaceError::InvalidState(_)),
            "seat {n} was fully redeemed"
        );
    }

    // --- Claim while still before the postponed event date ---
    assert!(cancel_at < postponed_end_ns());
    testing_env!(at(buyer(), cancel_at).build());
    contract.claim_refund(&buyer(), &seat(3), COL).unwrap();
    assert!(contract.scarces_by_id.get(&seat(3)).unwrap().refunded);
    assert_eq!(
        contract.get_collection(COL.into()).unwrap().refund_pool.0,
        REFUND * 2
    );

    // --- Same unused ticket, after the postponed date, still inside the claim window ---
    let after_postponed = postponed_end_ns() + 1;
    assert!(after_postponed < cancel_at + MIN_REFUND_DEADLINE_NS);
    testing_env!(at(buyer(), after_postponed).build());
    contract.claim_refund(&buyer(), &seat(4), COL).unwrap();
    assert!(contract.scarces_by_id.get(&seat(4)).unwrap().refunded);

    // Door is closed after the postponed date even if the seat was never redeemed.
    testing_env!(at(creator(), after_postponed).build());
    let err = contract
        .redeem_token(&creator(), &seat(5), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    // Organizer cannot sweep the leftover yet.
    testing_env!(at(creator(), after_postponed).build());
    let err = contract
        .withdraw_unclaimed_refunds(&creator(), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    // --- After the claim window: leftover seat goes back to the organizer ---
    let after_claim_window = cancel_at + MIN_REFUND_DEADLINE_NS + 1;
    testing_env!(at(buyer(), after_claim_window).build());
    let err = contract.claim_refund(&buyer(), &seat(5), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    testing_env!(at(creator(), after_claim_window).build());
    contract
        .withdraw_unclaimed_refunds(&creator(), COL)
        .unwrap();
    let col = contract.get_collection(COL.into()).unwrap();
    assert_eq!(col.refund_pool.0, 0);
    assert_eq!(col.refunded_count, 2);
    assert!(!contract.scarces_by_id.get(&seat(5)).unwrap().refunded);
}

/// Refunds do not exist until cancel — postpone alone does not pay holders.
#[test]
fn postpone_does_not_open_refunds() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn sold_ticket_resells_after_the_door_closes() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(creator(), T0_NS).build());
    contract
        .mint_from_collection(&creator(), COL, 1, None)
        .unwrap();

    let after_original = T0_NS + DAY_NS + 1;
    testing_env!(at(buyer(), after_original).build());
    contract.pending_attached_balance = 0;
    let err = contract
        .purchase_from_collection(&buyer(), COL.into(), 1, U128(u128::MAX), PRICE)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    assert_eq!(contract.pending_attached_balance, PRICE);
    assert_eq!(contract.get_collection(COL.into()).unwrap().minted_count, 2);

    testing_env!(at(creator(), after_original).build());
    let err = contract
        .transfer(&creator(), &buyer(), &seat(2), None, None)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    assert_eq!(
        contract.scarces_by_id.get(&seat(2)).unwrap().owner_id,
        creator()
    );

    testing_env!(at(buyer(), after_original).build());
    contract
        .list_native_scarce(&buyer(), &seat(1), U128(PRICE), None, None)
        .unwrap();
    testing_env!(at(creator(), after_original).build());
    contract.pending_attached_balance = 0;
    contract
        .purchase_native_scarce(&creator(), seat(1), PRICE)
        .unwrap();
    assert_eq!(
        contract.scarces_by_id.get(&seat(1)).unwrap().owner_id,
        creator()
    );

    testing_env!(at(creator(), after_original).build());
    let err = contract
        .redeem_token(&creator(), &seat(1), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn postponed_show_mints_until_the_new_door_then_closes() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();

    let after_original = T0_NS + DAY_NS + 1;
    buy(&mut contract, after_original, 1);
    assert_eq!(contract.get_collection(COL.into()).unwrap().minted_count, 2);

    let after_postponed = postponed_end_ns() + 1;
    testing_env!(at(buyer(), after_postponed).build());
    contract.pending_attached_balance = 0;
    let err = contract
        .purchase_from_collection(&buyer(), COL.into(), 1, U128(u128::MAX), PRICE)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
    assert_eq!(contract.pending_attached_balance, PRICE);
    assert_eq!(contract.get_collection(COL.into()).unwrap().minted_count, 2);

    testing_env!(at(buyer(), after_postponed).build());
    contract
        .list_native_scarce(&buyer(), &seat(1), U128(PRICE), None, None)
        .unwrap();
    testing_env!(at(creator(), after_postponed).build());
    contract.pending_attached_balance = 0;
    contract
        .purchase_native_scarce(&creator(), seat(1), PRICE)
        .unwrap();
    assert_eq!(
        contract.scarces_by_id.get(&seat(1)).unwrap().owner_id,
        creator()
    );
}

fn template_expires_at(contract: &Contract) -> u64 {
    let template: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(&contract.collections.get(COL).unwrap().metadata_template)
            .unwrap();
    template["expires_at"].as_u64().unwrap()
}

fn assert_event_ended(err: MarketplaceError) {
    match err {
        MarketplaceError::InvalidState(msg) => assert_eq!(msg, "Event has ended"),
        other => panic!("expected Event has ended, got {other:?}"),
    }
}

#[test]
fn postpone_stops_when_the_end_in_force_is_reached() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();

    let at_original = T0_NS + DAY_NS;
    testing_env!(at(creator(), at_original).build());
    let err = contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap_err();
    assert_event_ended(err);
    assert_eq!(contract.collections.get(COL).unwrap().event_ends_at, None);
    assert_eq!(template_expires_at(&contract), original_end_ms());

    let before_original = T0_NS + DAY_NS - NS_PER_MS;
    testing_env!(at(creator(), before_original).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();
    assert_eq!(
        contract.collections.get(COL).unwrap().event_ends_at,
        Some(postponed_end_ms())
    );
    // Fixture sale runs 30 days, past the event end, so postpone leaves it.
    assert_eq!(
        contract.collections.get(COL).unwrap().end_time,
        Some(T0_NS + 30 * DAY_NS)
    );

    let later_end_ms = T0_MS + 8 * DAY_MS;
    let before_postponed = postponed_end_ns() - NS_PER_MS;
    testing_env!(at(creator(), before_postponed).build());
    contract
        .update_collection_template_expiry(&creator(), COL, later_end_ms, None)
        .unwrap();
    assert_eq!(
        contract.collections.get(COL).unwrap().event_ends_at,
        Some(later_end_ms)
    );
    assert_eq!(template_expires_at(&contract), later_end_ms);

    testing_env!(at(creator(), later_end_ms * NS_PER_MS).build());
    let err = contract
        .update_collection_template_expiry(&creator(), COL, T0_MS + 12 * DAY_MS, None)
        .unwrap_err();
    assert_event_ended(err);
    assert_eq!(
        contract.collections.get(COL).unwrap().event_ends_at,
        Some(later_end_ms)
    );
    assert_eq!(template_expires_at(&contract), later_end_ms);
    assert_eq!(
        contract.collections.get(COL).unwrap().end_time,
        Some(T0_NS + 30 * DAY_NS)
    );
}

#[test]
fn postpone_extends_sale_close_that_matches_the_event_end() {
    let mut contract = new_contract();
    let mut cfg = ticket_config();
    cfg.start_time = Some(T0_NS);
    cfg.end_time = Some(original_end_ms() * NS_PER_MS);
    testing_env!(at(creator(), T0_NS).build());
    contract.create_collection(&creator(), cfg).unwrap();

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();

    let col = contract.collections.get(COL).unwrap();
    assert_eq!(col.start_time, Some(T0_NS));
    assert_eq!(col.end_time, Some(postponed_end_ms() * NS_PER_MS));
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter()
            .any(|line| line.contains("timing_update") && line.contains("end_time")),
        "postpone should emit the sale timing event, logs={logs:?}"
    );

    let after_original = T0_NS + DAY_NS + 1;
    buy(&mut contract, after_original, 1);
    assert_eq!(
        contract
            .scarces_by_id
            .get(&seat(1))
            .unwrap()
            .metadata
            .expires_at,
        Some(postponed_end_ms())
    );

    let later_end_ms = T0_MS + 8 * DAY_MS;
    testing_env!(at(creator(), T0_NS + DAY_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, later_end_ms, None)
        .unwrap();
    assert_eq!(
        contract.collections.get(COL).unwrap().end_time,
        Some(later_end_ms * NS_PER_MS)
    );
    assert_eq!(
        contract.collections.get(COL).unwrap().start_time,
        Some(T0_NS)
    );
}

#[test]
fn postpone_leaves_an_earlier_sale_close() {
    let mut contract = new_contract();
    let mut cfg = ticket_config();
    let earlier_ms = original_end_ms() - 60_000;
    cfg.end_time = Some(earlier_ms * NS_PER_MS);
    testing_env!(at(creator(), T0_NS).build());
    contract.create_collection(&creator(), cfg).unwrap();

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();

    let col = contract.collections.get(COL).unwrap();
    assert_eq!(col.end_time, Some(earlier_ms * NS_PER_MS));
    assert_eq!(col.start_time, Some(T0_NS));
    assert_eq!(col.event_ends_at, Some(postponed_end_ms()));
    let logs = near_sdk::test_utils::get_logs();
    assert!(
        logs.iter().all(|line| !line.contains("timing_update")),
        "an earlier sale close must stay, logs={logs:?}"
    );
}

#[test]
fn postpone_leaves_a_sale_with_no_close() {
    let mut contract = new_contract();
    let mut cfg = ticket_config();
    cfg.end_time = None;
    testing_env!(at(creator(), T0_NS).build());
    contract.create_collection(&creator(), cfg).unwrap();

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();

    let col = contract.collections.get(COL).unwrap();
    assert_eq!(col.end_time, None);
    assert_eq!(col.start_time, Some(T0_NS));
    assert_eq!(col.event_ends_at, Some(postponed_end_ms()));
}

#[test]
fn postpone_refuses_to_move_the_sale_before_it_opens() {
    let mut contract = new_contract();
    // Sale is closed at the show, and public sale opens before that show.
    // Pulling the show to before the open must not invert the sale window.
    let event_ms = T0_MS + 10 * DAY_MS;
    let open_ns = T0_NS + 8 * DAY_NS;
    let mut cfg = ticket_config();
    let extra = near_sdk::serde_json::json!({
        "kind": "ticket",
        "eventEndsAt": event_ms,
    });
    cfg.metadata_template = near_sdk::serde_json::json!({
        "title": "Guest #{seat_number}",
        "expires_at": event_ms,
        "extra": extra.to_string(),
    })
    .to_string();
    cfg.start_time = Some(open_ns);
    cfg.end_time = Some(event_ms * NS_PER_MS);
    testing_env!(at(creator(), T0_NS).build());
    contract.create_collection(&creator(), cfg).unwrap();

    let pulled_ms = T0_MS + 5 * DAY_MS;
    testing_env!(at(creator(), T0_NS).build());
    let err = contract
        .update_collection_template_expiry(&creator(), COL, pulled_ms, None)
        .unwrap_err();
    match err {
        MarketplaceError::InvalidInput(msg) => {
            assert_eq!(msg, "New event end must stay after the sale open.");
        }
        other => panic!("expected sale open guard, got {other:?}"),
    }
    let col = contract.collections.get(COL).unwrap();
    assert_eq!(col.event_ends_at, None);
    assert_eq!(col.end_time, Some(event_ms * NS_PER_MS));
    assert_eq!(col.start_time, Some(open_ns));
    assert_eq!(template_expires_at(&contract), event_ms);
}

#[test]
fn token_status_stays_open_until_the_postponed_end() {
    let mut contract = new_contract();
    testing_env!(at(creator(), T0_NS).build());
    contract
        .create_collection(&creator(), ticket_config())
        .unwrap();
    buy(&mut contract, T0_NS, 1);

    testing_env!(at(creator(), T0_NS).build());
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms(), None)
        .unwrap();
    assert_eq!(
        contract
            .scarces_by_id
            .get(&seat(1))
            .unwrap()
            .metadata
            .expires_at,
        Some(original_end_ms())
    );

    // Original close has passed. The postponed drop end is still ahead.
    testing_env!(at(creator(), T0_NS + DAY_NS + 1).build());
    let during = contract.get_token_status(seat(1)).unwrap();
    assert!(!during.is_expired);
    assert!(during.is_valid);
    assert!(contract.is_token_valid(seat(1)));

    testing_env!(at(creator(), postponed_end_ns()).build());
    let closed = contract.get_token_status(seat(1)).unwrap();
    assert!(closed.is_expired);
    assert!(!closed.is_valid);
    assert!(!contract.is_token_valid(seat(1)));
}
