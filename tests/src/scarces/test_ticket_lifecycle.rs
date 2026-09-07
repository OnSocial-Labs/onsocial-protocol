// =============================================================================
// Guest ticket short-date sandbox — cancel/refund + postpone
// =============================================================================
// Creates a real ticket collection with a door date a few seconds out, then
// exercises the live WASM path:
//   1. Buyer pays for seats
//   2. Cancel → holder claim_refund actually credits NEAR
//   3. Same show, postponed first — refund still works before and after the
//      new date (claim window is 60s, above the 5s sandbox minimum)
//
// Run:
//   make test-integration-contract-scarces-onsocial TEST=test_short_event
//   or cargo test -p onsocial-integration-tests test_short_event -- --nocapture

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

const COL: &str = "guest-show";
const PRICE: &str = "1000000000000000000000000"; // 1 NEAR
const REFUND: &str = "500000000000000000000000"; // 0.5 NEAR
const REFUND_YOCTO: u128 = 500_000_000_000_000_000_000_000;
/// Gas slack when asserting a refund credit (0.01 NEAR).
const GAS_SLACK: u128 = 10_000_000_000_000_000_000_000;
/// Sandbox min refund window is 5s; keep this short but past the postponed door.
const CLAIM_WINDOW_NS: u64 = 60 * 1_000_000_000;

async fn setup() -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    Ok((worker, owner, contract))
}

async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

async fn now_ns(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<u64> {
    Ok(worker.view_block().await?.timestamp())
}

async fn fast_forward_past(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    target_ns: u64,
) -> Result<u64> {
    for _ in 0..40 {
        let now = now_ns(worker).await?;
        if now > target_ns {
            return Ok(now);
        }
        worker.fast_forward(10).await?;
    }
    anyhow::bail!(
        "sandbox time did not pass {} (now={})",
        target_ns,
        now_ns(worker).await?
    )
}

fn ticket_template(expires_at_ms: u64) -> serde_json::Value {
    let extra = json!({
        "kind": "ticket",
        "eventEndsAt": expires_at_ms,
    });
    json!({
        "title": "Guest #{seat_number}",
        "expires_at": expires_at_ms,
        "extra": extra.to_string(),
    })
}

async fn create_ticket_show(
    contract: &near_workspaces::Contract,
    creator: &near_workspaces::Account,
    expires_at_ms: u64,
) -> Result<()> {
    create_collection_with_options(
        contract,
        creator,
        COL,
        8,
        PRICE,
        ticket_template(expires_at_ms),
        "none",
        Some(1),
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    Ok(())
}

async fn buy_seats(
    contract: &near_workspaces::Contract,
    buyer: &near_workspaces::Account,
    quantity: u32,
) -> Result<Vec<String>> {
    purchase_from_collection(
        contract,
        buyer,
        COL,
        quantity,
        PRICE,
        NearToken::from_near(quantity as u128),
    )
    .await?
    .into_result()?;
    let tokens = nft_tokens_for_owner(contract, &buyer.id().to_string(), None, Some(20)).await?;
    let mut ids: Vec<String> = tokens
        .iter()
        .filter(|t| t.token_id.starts_with(&format!("{COL}:")))
        .map(|t| t.token_id.clone())
        .collect();
    ids.sort();
    Ok(ids)
}

fn assert_refunded(before: u128, after: u128) {
    let credited = after.saturating_sub(before);
    assert!(
        after + GAS_SLACK >= before + REFUND_YOCTO,
        "refund should credit ~0.5 NEAR (before={before} after={after} credited={credited})"
    );
    println!(
        "refund credited {} yocto (~{:.4} NEAR)",
        credited,
        credited as f64 / 1e24
    );
}

/// Short-dated show → cancel → unused seat refunds; redeemed seat does not.
#[tokio::test]
async fn test_short_event_cancel_refunds_buyer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    let original_end_ms = now_ns(&worker).await? / 1_000_000 + 8_000;
    create_ticket_show(&contract, &creator, original_end_ms).await?;

    let seats = buy_seats(&contract, &buyer, 2).await?;
    assert_eq!(seats.len(), 2);
    let used = &seats[0];
    let unused = &seats[1];

    redeem_token(&contract, &creator, used, COL, ONE_YOCTO)
        .await?
        .into_result()?;

    // Event date is short — wait until the door has closed, then cancel.
    fast_forward_past(&worker, original_end_ms * 1_000_000).await?;
    let redeem_closed = redeem_token(&contract, &creator, unused, COL, ONE_YOCTO).await?;
    assert!(
        redeem_closed.into_result().is_err(),
        "door should be closed after the short event date"
    );

    cancel_collection(
        &contract,
        &creator,
        COL,
        REFUND,
        Some(CLAIM_WINDOW_NS),
        NearToken::from_millinear(500), // 1 unused × 0.5 NEAR
    )
    .await?
    .into_result()?;

    let col = get_collection(&contract, COL).await?.unwrap();
    assert!(col.cancelled);
    assert_eq!(col.refund_per_token, REFUND);

    let redeemed_claim = claim_refund(&contract, &buyer, used, COL, ONE_YOCTO).await?;
    assert!(
        redeemed_claim.into_result().is_err(),
        "used ticket cannot refund"
    );

    let before = buyer.view_account().await?.balance.as_yoctonear();
    claim_refund(&contract, &buyer, unused, COL, ONE_YOCTO)
        .await?
        .into_result()?;
    let after = buyer.view_account().await?.balance.as_yoctonear();
    assert_refunded(before, after);

    let status = get_token_status(&contract, unused).await?.unwrap();
    assert!(status.is_refunded);
    println!("short-event cancel: buyer credited 0.5 NEAR for {unused}");
    Ok(())
}

/// Short-dated show → postpone → cancel → refund before and after the new date.
#[tokio::test]
async fn test_short_event_postpone_then_cancel_refunds() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;

    let original_end_ms = now_ns(&worker).await? / 1_000_000 + 8_000;
    create_ticket_show(&contract, &creator, original_end_ms).await?;

    let seats = buy_seats(&contract, &buyer, 3).await?;
    assert_eq!(seats.len(), 3);
    let walked_in = &seats[0];
    let refund_before = &seats[1];
    let refund_after = &seats[2];

    redeem_token(&contract, &creator, walked_in, COL, ONE_YOCTO)
        .await?
        .into_result()?;

    // Original short date passes — unused seats cannot enter.
    fast_forward_past(&worker, original_end_ms * 1_000_000).await?;
    let expired = redeem_token(&contract, &creator, refund_before, COL, ONE_YOCTO).await?;
    assert!(
        expired.into_result().is_err(),
        "cannot redeem after original short date"
    );

    let postponed_end_ms = now_ns(&worker).await? / 1_000_000 + 15_000;
    let postponed_end_ns = postponed_end_ms * 1_000_000;
    for seat in [refund_before, refund_after] {
        renew_token(&contract, &creator, seat, COL, postponed_end_ns, ONE_YOCTO)
            .await?
            .into_result()?;
    }
    update_collection_template_expiry(&contract, &creator, COL, postponed_end_ms, ONE_YOCTO)
        .await?
        .into_result()?;

    // New sale after postpone inherits the new door; redeem proves it works.
    let after_postpone = buy_seats(&contract, &buyer, 1).await?;
    let extra = after_postpone
        .iter()
        .find(|id| !seats.contains(id))
        .expect("seat minted after postpone");
    let tok = nft_token(&contract, extra).await?.unwrap();
    assert_eq!(tok.metadata.unwrap().expires_at, Some(postponed_end_ms));
    redeem_token(&contract, &creator, extra, COL, ONE_YOCTO)
        .await?
        .into_result()?;

    // Unused after cancel: refund_before + refund_after (walked_in + extra redeemed).
    cancel_collection(
        &contract,
        &creator,
        COL,
        REFUND,
        Some(CLAIM_WINDOW_NS),
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    assert!(now_ns(&worker).await? < postponed_end_ns);
    let before = buyer.view_account().await?.balance.as_yoctonear();
    claim_refund(&contract, &buyer, refund_before, COL, ONE_YOCTO)
        .await?
        .into_result()?;
    let mid = buyer.view_account().await?.balance.as_yoctonear();
    assert_refunded(before, mid);
    println!("postpone: refunded {refund_before} before new date");

    fast_forward_past(&worker, postponed_end_ns).await?;
    let door = redeem_token(&contract, &creator, refund_after, COL, ONE_YOCTO).await?;
    assert!(
        door.into_result().is_err(),
        "door closed after postponed date"
    );

    let before_second = buyer.view_account().await?.balance.as_yoctonear();
    claim_refund(&contract, &buyer, refund_after, COL, ONE_YOCTO)
        .await?
        .into_result()?;
    let after = buyer.view_account().await?.balance.as_yoctonear();
    assert_refunded(before_second, after);
    println!("postpone: refunded {refund_after} after new date");

    let used_claim = claim_refund(&contract, &buyer, walked_in, COL, ONE_YOCTO).await?;
    assert!(
        used_claim.into_result().is_err(),
        "redeemed seat still cannot refund after postpone"
    );
    Ok(())
}
