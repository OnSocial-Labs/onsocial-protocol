//! Guest ticket lifecycle — one rain-day show, then a cancel.
//!
//! Three clocks:
//! - sale window (`start_time` / `end_time`, ns)
//! - door access (`metadata.expires_at`, ms) — postpone renews this
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

    // --- Original event date has passed; unused tickets cannot enter ---
    let after_original = T0_NS + DAY_NS + 1;
    testing_env!(at(creator(), after_original).build());
    let err = contract
        .redeem_token(&creator(), &seat(2), COL)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));

    // --- Rain-day postpone: renew held seats + mint template ---
    testing_env!(at(creator(), after_original).build());
    for n in 2..=4 {
        contract
            .renew_token(&creator(), &seat(n), COL, postponed_end_ns())
            .unwrap();
    }
    contract
        .update_collection_template_expiry(&creator(), COL, postponed_end_ms())
        .unwrap();

    let template: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(&contract.collections.get(COL).unwrap().metadata_template)
            .unwrap();
    assert_eq!(template["expires_at"], postponed_end_ms());
    let extra: near_sdk::serde_json::Value =
        near_sdk::serde_json::from_str(template["extra"].as_str().unwrap()).unwrap();
    assert_eq!(extra["eventEndsAt"], postponed_end_ms());

    // Door works again after postpone.
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
        .renew_token(&creator(), &seat(1), COL, postponed_end_ns())
        .unwrap();

    testing_env!(at(buyer(), T0_NS).build());
    let err = contract.claim_refund(&buyer(), &seat(1), COL).unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}
