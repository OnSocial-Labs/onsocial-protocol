// Dollar listings settled through the real purchase promise chain.
// A mock oracle contract stands in for price-oracle.near. The scarce wasm is
// the release build, so these checks run the same receipts a buyer signs.

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::Deserialize;
use serde_json::json;

use super::helpers::*;
use crate::utils::get_wasm_path;

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Oracle fetch fee the buyer attaches on top of the maximum NEAR.
const ORACLE_FEE: u128 = 10_000_000_000_000_000_000_000;
const ASSET_ID: &str = "wrap.near";
const ONE_DOLLAR: &str = "1000000";
/// Oracle multiplier for $1 per NEAR at 8 decimals.
const ORACLE_ONE_DOLLAR: &str = "100000000";
/// Converts a $1 sticker to more than 1.005 NEAR.
const ORACLE_PAST_STOP: &str = "99000000";

#[derive(Debug, Deserialize)]
struct DollarView {
    usd_e6: String,
    min_near: String,
}

struct World {
    contract: Contract,
    oracle: Contract,
}

async fn yocto(account: &Account) -> Result<u128> {
    Ok(account.view_account().await?.balance.as_yoctonear())
}

async fn deploy_oracle(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    multiplier: &str,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("mock-oracle");
    let wasm = std::fs::read(&wasm_path)?;
    let oracle = worker.dev_deploy(&wasm).await?;
    let deployer = worker.dev_create_account().await?;
    deployer
        .call(oracle.id(), "new")
        .args_json(json!({
            "multiplier": multiplier,
            "decimals": 8,
            "publish_time": 0,
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(oracle)
}

async fn world(
    multiplier: &str,
) -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    World,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let oracle = deploy_oracle(&worker, multiplier).await?;
    owner
        .call(contract.id(), "set_dollar_oracle")
        .args_json(json!({
            "oracle_contract": oracle.id(),
            "asset_id": ASSET_ID,
            "max_age_seconds": 3600,
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    Ok((worker, World { contract, oracle }))
}

async fn user_with_token(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &Contract,
    title: &str,
) -> Result<(Account, String)> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(contract, &user, title, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(contract, &user.id().to_string(), None, Some(1)).await?;
    Ok((user, tokens[0].token_id.clone()))
}

async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &Contract,
) -> Result<Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

async fn list_dollar(contract: &Contract, seller: &Account, token_id: &str) -> Result<()> {
    execute_action(
        contract,
        seller,
        json!({
            "type": "list_native_scarce",
            "token_id": token_id,
            "price": "1",
            "usd_e6": ONE_DOLLAR,
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;
    Ok(())
}

async fn dollar_of(contract: &Contract, scope: &str, id: &str) -> Result<Option<DollarView>> {
    let result = contract
        .view("get_dollar_price")
        .args_json(json!({ "scope": scope, "id": id }))
        .await?;
    Ok(serde_json::from_slice(&result.result)?)
}

async fn buy_dollar(
    contract: &Contract,
    buyer: &Account,
    scope: &str,
    id: &str,
    max_near: u128,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = buyer
        .call(contract.id(), "purchase_dollar")
        .args_json(json!({
            "scope": scope,
            "id": id,
            "quantity": 1,
            "max_near": max_near.to_string(),
        }))
        .deposit(NearToken::from_yoctonear(max_near + ORACLE_FEE))
        .max_gas()
        .transact()
        .await?;
    Ok(result)
}

fn outcome_text(result: &near_workspaces::result::ExecutionFinalResult) -> String {
    format!("{result:?}\nlogs: {:?}", result.logs())
}

#[tokio::test]
async fn dollar_sale_charges_the_oracle_near_and_refunds_the_offer() -> Result<()> {
    let (worker, world) = world(ORACLE_ONE_DOLLAR).await?;
    let (seller, token_id) = user_with_token(&worker, &world.contract, "Dollar").await?;
    list_dollar(&world.contract, &seller, &token_id).await?;

    let sticker = dollar_of(&world.contract, "sale", &token_id)
        .await?
        .expect("sticker");
    assert_eq!(sticker.usd_e6, ONE_DOLLAR);
    assert_eq!(sticker.min_near, "0");
    let sale = get_sale(&world.contract, &token_id).await?.expect("sale");
    assert_eq!(sale.sale_conditions, "1");

    let buyer = user_with_storage(&worker, &world.contract).await?;
    let refused =
        purchase_native_scarce(&world.contract, &buyer, &token_id, NearToken::from_near(2)).await?;
    assert!(
        refused.is_failure(),
        "NEAR checkout should refuse a dollar listing: {}",
        outcome_text(&refused)
    );
    let still = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(still.owner_id, seller.id().to_string());
    assert!(dollar_of(&world.contract, "sale", &token_id)
        .await?
        .is_some());

    let offerer = user_with_storage(&worker, &world.contract).await?;
    let offerer_before = yocto(&offerer).await?;
    make_offer(
        &world.contract,
        &offerer,
        &token_id,
        &(2 * ONE_NEAR).to_string(),
        None,
        NearToken::from_yoctonear(2 * ONE_NEAR),
    )
    .await?
    .into_result()?;

    let buyer_before = yocto(&buyer).await?;
    let seller_before = yocto(&seller).await?;
    let bought = buy_dollar(
        &world.contract,
        &buyer,
        "sale",
        &token_id,
        ONE_NEAR * 1005 / 1000,
    )
    .await?;
    assert!(
        bought.is_success(),
        "dollar purchase should settle: {}",
        outcome_text(&bought)
    );

    let token = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(token.owner_id, buyer.id().to_string());
    assert!(dollar_of(&world.contract, "sale", &token_id)
        .await?
        .is_none());
    assert!(get_sale(&world.contract, &token_id).await?.is_none());

    let buyer_spent = buyer_before - yocto(&buyer).await?;
    assert!(
        buyer_spent > ONE_NEAR * 9 / 10,
        "buyer should pay about 1 NEAR, spent {buyer_spent}"
    );
    assert!(
        buyer_spent < ONE_NEAR * 3 / 2,
        "surplus NEAR should be refunded, spent {buyer_spent}"
    );
    let seller_gain = yocto(&seller).await? - seller_before;
    assert!(
        seller_gain > ONE_NEAR * 9 / 10 && seller_gain < ONE_NEAR * 12 / 10,
        "seller should receive the 1 NEAR price after the fee, gained {seller_gain}"
    );
    let offerer_lost = offerer_before - yocto(&offerer).await?;
    assert!(
        offerer_lost < ONE_NEAR / 5,
        "the open offer should be refunded, lost {offerer_lost}"
    );

    Ok(())
}

#[tokio::test]
async fn dollar_sale_refunds_when_the_stop_or_the_oracle_fails() -> Result<()> {
    let (worker, world) = world(ORACLE_PAST_STOP).await?;
    let (seller, token_id) = user_with_token(&worker, &world.contract, "Stop").await?;
    list_dollar(&world.contract, &seller, &token_id).await?;
    let buyer = user_with_storage(&worker, &world.contract).await?;

    let before = yocto(&buyer).await?;
    let stopped = buy_dollar(
        &world.contract,
        &buyer,
        "sale",
        &token_id,
        ONE_NEAR * 1005 / 1000,
    )
    .await?;
    assert!(
        stopped.is_success(),
        "a stop refunds inside the callback: {}",
        outcome_text(&stopped)
    );
    let token = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(token.owner_id, seller.id().to_string());
    assert!(dollar_of(&world.contract, "sale", &token_id)
        .await?
        .is_some());
    let spent = before - yocto(&buyer).await?;
    assert!(
        spent < ONE_NEAR / 4,
        "the payment should come back when the price clears the stop, spent {spent}"
    );

    world
        .oracle
        .call("set_quote")
        .args_json(json!({
            "multiplier": ORACLE_ONE_DOLLAR,
            "publish_time": 1,
        }))
        .transact()
        .await?
        .into_result()?;

    let before_stale = yocto(&buyer).await?;
    let stale = buy_dollar(
        &world.contract,
        &buyer,
        "sale",
        &token_id,
        ONE_NEAR * 1005 / 1000,
    )
    .await?;
    assert!(
        stale.is_success(),
        "a stale price refunds inside the callback: {}",
        outcome_text(&stale)
    );
    let token = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(token.owner_id, seller.id().to_string());
    let spent_stale = before_stale - yocto(&buyer).await?;
    assert!(
        spent_stale < ONE_NEAR / 4,
        "a stale price should refund the payment, spent {spent_stale}"
    );

    world
        .oracle
        .call("set_quote")
        .args_json(json!({
            "multiplier": ORACLE_ONE_DOLLAR,
            "publish_time": 0,
        }))
        .transact()
        .await?
        .into_result()?;
    world
        .oracle
        .call("set_fail_calls")
        .args_json(json!({ "fail": true }))
        .transact()
        .await?
        .into_result()?;

    let before_fail = yocto(&buyer).await?;
    let failed = buy_dollar(
        &world.contract,
        &buyer,
        "sale",
        &token_id,
        ONE_NEAR * 1005 / 1000,
    )
    .await?;
    let token = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(token.owner_id, seller.id().to_string());
    assert!(dollar_of(&world.contract, "sale", &token_id)
        .await?
        .is_some());
    let spent_fail = before_fail - yocto(&buyer).await?;
    assert!(
        spent_fail < ONE_NEAR / 4,
        "a rejected oracle call should refund the payment, spent {spent_fail}, {}",
        outcome_text(&failed)
    );

    Ok(())
}

#[tokio::test]
async fn accepting_an_offer_sells_for_the_bid_and_clears_the_sticker() -> Result<()> {
    let (worker, world) = world(ORACLE_ONE_DOLLAR).await?;
    let (seller, token_id) = user_with_token(&worker, &world.contract, "Offer").await?;
    list_dollar(&world.contract, &seller, &token_id).await?;
    let offerer = user_with_storage(&worker, &world.contract).await?;
    make_offer(
        &world.contract,
        &offerer,
        &token_id,
        &(2 * ONE_NEAR).to_string(),
        None,
        NearToken::from_yoctonear(2 * ONE_NEAR),
    )
    .await?
    .into_result()?;

    let seller_before = yocto(&seller).await?;
    accept_offer(
        &world.contract,
        &seller,
        &token_id,
        &offerer.id().to_string(),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let token = nft_token(&world.contract, &token_id).await?.expect("token");
    assert_eq!(token.owner_id, offerer.id().to_string());
    assert!(get_sale(&world.contract, &token_id).await?.is_none());
    assert!(dollar_of(&world.contract, "sale", &token_id)
        .await?
        .is_none());
    let gain = yocto(&seller).await? - seller_before;
    assert!(
        gain > ONE_NEAR && gain < 3 * ONE_NEAR,
        "accepting the offer should pay the 2 NEAR bid, gained {gain}"
    );

    Ok(())
}

#[tokio::test]
async fn dollar_drop_keeps_the_sticker_and_refunds_the_organizer_amount() -> Result<()> {
    let (worker, world) = world(ORACLE_ONE_DOLLAR).await?;
    let creator = user_with_storage(&worker, &world.contract).await?;
    create_collection(
        &world.contract,
        &creator,
        "drop",
        2,
        "1",
        json!({ "title": "Drop", "description": "Dollar drop" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    execute_action(
        &world.contract,
        &creator,
        json!({
            "type": "update_collection_price",
            "collection_id": "drop",
            "new_price_near": "1",
            "usd_e6": ONE_DOLLAR,
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let buyer = user_with_storage(&worker, &world.contract).await?;
    let refused = purchase_from_collection(
        &world.contract,
        &buyer,
        "drop",
        1,
        &(2 * ONE_NEAR).to_string(),
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        refused.is_failure(),
        "NEAR mint should refuse a dollar drop: {}",
        outcome_text(&refused)
    );
    assert!(dollar_of(&world.contract, "collection", "drop")
        .await?
        .is_some());

    let bought = buy_dollar(
        &world.contract,
        &buyer,
        "collection",
        "drop",
        ONE_NEAR * 1005 / 1000,
    )
    .await?;
    assert!(
        bought.is_success(),
        "collection dollar mint should settle: {}",
        outcome_text(&bought)
    );

    let token_id = "drop:1";
    let token = nft_token(&world.contract, token_id).await?.expect("token");
    assert_eq!(token.owner_id, buyer.id().to_string());
    let sticker = dollar_of(&world.contract, "collection", "drop")
        .await?
        .expect("collection sticker stays");
    assert_eq!(sticker.usd_e6, ONE_DOLLAR);

    let status = get_token_status(&world.contract, token_id)
        .await?
        .expect("status");
    assert_eq!(status.paid_price, ONE_NEAR.to_string());

    let refund = 500_000u128;
    cancel_collection(
        &world.contract,
        &creator,
        "drop",
        &refund.to_string(),
        None,
        NearToken::from_yoctonear(refund),
    )
    .await?
    .into_result()?;
    let claimed = claim_refund(&world.contract, &buyer, token_id, "drop", ONE_YOCTO).await?;
    assert!(
        claimed.is_success(),
        "claim should pay the organizer amount: {}",
        outcome_text(&claimed)
    );
    let claimed_text = outcome_text(&claimed);
    assert!(
        claimed_text.contains("500000"),
        "refund event should carry the organizer amount: {claimed_text}"
    );
    let status = get_token_status(&world.contract, token_id)
        .await?
        .expect("status");
    assert!(status.is_refunded);
    assert_eq!(status.paid_price, ONE_NEAR.to_string());
    assert!(dollar_of(&world.contract, "collection", "drop")
        .await?
        .is_some());

    Ok(())
}
