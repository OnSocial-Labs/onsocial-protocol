// Live testnet check: dollar purchases settled by the real OutLayer oracle.
//
// The sandbox suite stands a mock in for the oracle. This file deploys the
// release scarce wasm to a fresh testnet account, points it at
// price-oracle.testnet, and buys with only the maximum NEAR attached — the
// platform storage pool pays the oracle fetch fee, proving sponsorship
// against the live TEE fetch. A stale cache makes the first purchase wait on
// the off-chain OutLayer worker (promise yield); the second purchase then
// settles from the fresh cache.
//
// Ignored by default: it spends faucet NEAR and depends on live services.
//
// Run: cargo test -p onsocial-integration-tests --release -- \
//        scarces::test_dollar_testnet -- --ignored --nocapture --test-threads=1

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

use super::helpers::*;
use crate::utils::get_wasm_path;

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;
/// Oracle fetch fee the pool pays on the buyer's behalf.
const ORACLE_FEE: u128 = 10_000_000_000_000_000_000_000;
const LIVE_ORACLE: &str = "price-oracle.testnet";
/// The testnet oracle registers mainnet asset ids; wrap.near is its NEAR/USD.
const LIVE_ASSET: &str = "wrap.near";
const ONE_DOLLAR: &str = "1000000";
/// A wide buyer stop for a $1 sticker: holds unless NEAR falls under $0.25.
const MAX_NEAR: u128 = 4 * ONE_NEAR;

async fn yocto(account: &Account) -> Result<u128> {
    Ok(account.view_account().await?.balance.as_yoctonear())
}

async fn pool_balance(contract: &Contract) -> Result<u128> {
    Ok(get_platform_storage_balance(contract).await?.parse()?)
}

fn outcome_text(result: &near_workspaces::result::ExecutionFinalResult) -> String {
    format!("{result:?}\nlogs: {:?}", result.logs())
}

/// Read the live oracle cache and report whether our asset's price is fresh.
async fn live_cache_fresh(
    worker: &near_workspaces::Worker<near_workspaces::network::Testnet>,
) -> Result<bool> {
    let oracle_id: near_workspaces::AccountId = LIVE_ORACLE.parse()?;
    let data = worker
        .view(&oracle_id, "get_price_data")
        .args_json(json!({ "asset_ids": [LIVE_ASSET] }))
        .await?;
    let body: serde_json::Value = serde_json::from_slice(&data.result)?;
    let price = &body["prices"][0]["price"];
    if price.is_object() {
        println!(
            "live oracle cache: fresh, {} at {} decimals",
            price["multiplier"], price["decimals"]
        );
        Ok(true)
    } else {
        println!("live oracle cache: stale, the next purchase fetches from the TEE");
        Ok(false)
    }
}

/// Purchase with only the maximum NEAR attached and wait out the TEE yield.
/// Without pool sponsorship the contract rejects this deposit, so a success
/// here is the sponsorship proof.
async fn buy_dollar_live(
    contract: &Contract,
    buyer: &Account,
    token_id: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let status = buyer
        .call(contract.id(), "purchase_dollar")
        .args_json(json!({
            "scope": "sale",
            "id": token_id,
            "quantity": 1,
            "max_near": MAX_NEAR.to_string(),
        }))
        .deposit(NearToken::from_yoctonear(MAX_NEAR))
        .max_gas()
        .transact_async()
        .await?;

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(360);
    loop {
        match status.status().await? {
            std::task::Poll::Ready(outcome) => return Ok(outcome),
            std::task::Poll::Pending => {
                anyhow::ensure!(
                    std::time::Instant::now() < deadline,
                    "the live oracle did not settle within six minutes"
                );
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
}

async fn assert_live_purchase(
    contract: &Contract,
    buyer: &Account,
    token_id: &str,
) -> Result<()> {
    let buyer_before = yocto(buyer).await?;
    let bought = buy_dollar_live(contract, buyer, token_id).await?;
    assert!(
        bought.is_success(),
        "a sponsored purchase settles against the live oracle: {}",
        outcome_text(&bought)
    );

    let token = nft_token(contract, token_id).await?.expect("token");
    assert_eq!(token.owner_id, buyer.id().to_string());

    let spent = buyer_before - yocto(buyer).await?;
    assert!(spent > ONE_NEAR / 200, "the $1 sticker costs NEAR: {spent}");
    assert!(
        spent < MAX_NEAR,
        "the surplus comes back under the stop: {spent}"
    );
    println!("buyer spent {spent} yocto for a $1 sticker (stop {MAX_NEAR})");
    Ok(())
}

#[tokio::test]
#[ignore = "live testnet: spends faucet NEAR and waits on the OutLayer worker"]
async fn dollar_sale_settles_against_the_live_testnet_oracle() -> Result<()> {
    let worker = near_workspaces::testnet().await?;

    // The 1 MB wasm needs more than the ~10 NEAR a faucet account holds.
    let contract_account = worker.dev_create_account().await?;
    let funder = worker.dev_create_account().await?;
    funder
        .transfer_near(contract_account.id(), NearToken::from_near(8))
        .await?
        .into_result()?;
    let wasm = std::fs::read(get_wasm_path("scarces-onsocial"))?;
    let contract = contract_account.deploy(&wasm).await?.into_result()?;

    // The contract account is its own owner, so owner-gated calls sign locally.
    contract
        .call("new")
        .args_json(json!({ "owner_id": contract.id().to_string() }))
        .deposit(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;
    // Headroom above the 5 NEAR reserve so the pool sponsors the fetch fee.
    contract
        .call("fund_platform_storage")
        .deposit(NearToken::from_near(1))
        .transact()
        .await?
        .into_result()?;
    contract
        .call("set_dollar_oracle")
        .args_json(json!({
            "oracle_contract": LIVE_ORACLE,
            "asset_id": LIVE_ASSET,
            "max_age_seconds": 3600,
        }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let seller = worker.dev_create_account().await?;
    storage_deposit(&contract, &seller, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(&contract, &seller, "Live Oracle One", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    quick_mint(&contract, &seller, "Live Oracle Two", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(&contract, &seller.id().to_string(), None, Some(2)).await?;
    assert_eq!(tokens.len(), 2, "seller minted two tokens");
    for token in &tokens {
        execute_action(
            &contract,
            &seller,
            json!({
                "type": "list_native_scarce",
                "token_id": token.token_id,
                "price": "1",
                "usd_e6": ONE_DOLLAR,
            }),
            DEPOSIT_STORAGE,
        )
        .await?
        .into_result()?;
    }

    let pool_before = pool_balance(&contract).await?;

    // First purchase: a stale cache routes through the OutLayer TEE worker.
    live_cache_fresh(&worker).await?;
    let buyer_one = worker.dev_create_account().await?;
    storage_deposit(&contract, &buyer_one, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    assert_live_purchase(&contract, &buyer_one, &tokens[0].token_id).await?;

    // Second purchase: the fetch above leaves a fresh cache behind.
    live_cache_fresh(&worker).await?;
    let buyer_two = worker.dev_create_account().await?;
    storage_deposit(&contract, &buyer_two, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    assert_live_purchase(&contract, &buyer_two, &tokens[1].token_id).await?;

    // The pool paid at most the fetch fee per stale purchase and never dipped
    // under its reserve; freed listing storage flows back to it.
    let pool_after = pool_balance(&contract).await?;
    assert!(
        pool_after + 2 * ORACLE_FEE >= pool_before,
        "the pool spends at most the fetch fees: before {pool_before}, after {pool_after}"
    );
    assert!(
        pool_after >= 5 * ONE_NEAR,
        "the pool never dips under its reserve: {pool_after}"
    );
    println!("platform pool: before {pool_before}, after {pool_after}");

    Ok(())
}
