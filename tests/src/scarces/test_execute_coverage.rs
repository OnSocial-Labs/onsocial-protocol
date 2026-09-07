// =============================================================================
// Every scarces `execute` action — one on-chain sandbox pass
// =============================================================================
// Hits each Action type against real WASM so mainnet release has a single
// checklist that the VM accepted the call. Existing modules add depth.

use std::collections::HashSet;

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

const ALL_EXECUTE_TYPES: &[&str] = &[
    "quick_mint",
    "transfer_scarce",
    "batch_transfer",
    "approve_scarce",
    "revoke_scarce",
    "revoke_all_scarce",
    "burn_scarce",
    "renew_token",
    "revoke_token",
    "redeem_token",
    "claim_refund",
    "create_collection",
    "update_collection_price",
    "update_collection_timing",
    "mint_from_collection",
    "airdrop_from_collection",
    "delete_collection",
    "pause_collection",
    "resume_collection",
    "set_allowlist",
    "remove_from_allowlist",
    "add_redeemer",
    "remove_redeemer",
    "set_redeemers",
    "set_collection_metadata",
    "update_collection_template_expiry",
    "set_collection_app_metadata",
    "withdraw_unclaimed_refunds",
    "list_native_scarce",
    "delist_native_scarce",
    "list_native_scarce_auction",
    "settle_auction",
    "cancel_auction",
    "delist_scarce",
    "update_price",
    "accept_offer",
    "cancel_offer",
    "accept_collection_offer",
    "cancel_collection_offer",
    "create_lazy_listing",
    "cancel_lazy_listing",
    "update_lazy_listing_price",
    "update_lazy_listing_expiry",
    "purchase_from_collection",
    "purchase_lazy_listing",
    "purchase_native_scarce",
    "place_bid",
    "make_offer",
    "make_collection_offer",
    "cancel_collection",
    "fund_app_pool",
    "storage_deposit",
    "register_app",
    "set_spending_cap",
    "storage_withdraw",
    "withdraw_app_pool",
    "withdraw_platform_storage",
    "set_app_config",
    "transfer_app_ownership",
    "add_moderator",
    "remove_moderator",
    "add_approved_creator",
    "add_approved_creators",
    "remove_approved_creator",
    "ban_collection",
    "unban_collection",
];

const ONE_NEAR: &str = "1000000000000000000000000";
const HALF_NEAR: &str = "500000000000000000000000";
const TICKET_COL: &str = "cov-tickets";
const PLAIN_COL: &str = "cov-plain";
const INV_COL: &str = "cov-inv";
const EMPTY_COL: &str = "cov-empty";
const APP: &str = "cov-app";

async fn hit(
    seen: &mut HashSet<&'static str>,
    contract: &near_workspaces::Contract,
    caller: &near_workspaces::Account,
    ty: &'static str,
    action: serde_json::Value,
    deposit: NearToken,
) -> Result<()> {
    execute_action(contract, caller, action, deposit)
        .await?
        .into_result()
        .map_err(|e| anyhow::anyhow!("{ty} failed: {e:?}"))?;
    seen.insert(ty);
    println!("on-chain ok  {ty}");
    Ok(())
}

async fn last_token(
    contract: &near_workspaces::Contract,
    owner: &near_workspaces::Account,
) -> Result<String> {
    let tokens = nft_tokens_for_owner(contract, &owner.id().to_string(), None, Some(50)).await?;
    Ok(tokens.last().unwrap().token_id.clone())
}

async fn user(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let u = worker.dev_create_account().await?;
    storage_deposit(contract, &u, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(u)
}

#[tokio::test]
async fn test_every_execute_action_on_chain() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let creator = user(&worker, &contract).await?;
    let buyer = user(&worker, &contract).await?;
    let staff = user(&worker, &contract).await?;
    let extra = user(&worker, &contract).await?;
    let mut seen = HashSet::new();

    // storage_deposit already ran in user(); mark it and hit withdraw + cap.
    seen.insert("storage_deposit");
    println!("on-chain ok  storage_deposit");

    hit(
        &mut seen,
        &contract,
        &buyer,
        "set_spending_cap",
        json!({ "type": "set_spending_cap", "cap": ONE_NEAR }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "storage_withdraw",
        json!({ "type": "storage_withdraw" }),
        ONE_YOCTO,
    )
    .await?;
    storage_deposit(&contract, &buyer, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // --- Standalone token ---
    hit(
        &mut seen,
        &contract,
        &creator,
        "quick_mint",
        json!({
            "type": "quick_mint",
            "metadata": { "title": "cov-a" },
            "transferable": true,
            "burnable": true,
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    let tok_a = last_token(&contract, &creator).await?;

    hit(
        &mut seen,
        &contract,
        &creator,
        "approve_scarce",
        json!({
            "type": "approve_scarce",
            "token_id": tok_a,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "revoke_scarce",
        json!({
            "type": "revoke_scarce",
            "token_id": tok_a,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    execute_action(
        &contract,
        &creator,
        json!({
            "type": "approve_scarce",
            "token_id": tok_a,
            "account_id": extra.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "revoke_all_scarce",
        json!({ "type": "revoke_all_scarce", "token_id": tok_a }),
        ONE_YOCTO,
    )
    .await?;

    quick_mint(&contract, &creator, "cov-b", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_b = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "transfer_scarce",
        json!({
            "type": "transfer_scarce",
            "receiver_id": extra.id().to_string(),
            "token_id": tok_b,
        }),
        ONE_YOCTO,
    )
    .await?;

    quick_mint(&contract, &creator, "cov-c1", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let t1 = last_token(&contract, &creator).await?;
    quick_mint(&contract, &creator, "cov-c2", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let t2 = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "batch_transfer",
        json!({
            "type": "batch_transfer",
            "transfers": [
                { "receiver_id": extra.id().to_string(), "token_id": t1 },
                { "receiver_id": staff.id().to_string(), "token_id": t2 },
            ]
        }),
        ONE_YOCTO,
    )
    .await?;

    quick_mint(&contract, &creator, "cov-list", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_list = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "list_native_scarce",
        json!({
            "type": "list_native_scarce",
            "token_id": tok_list,
            "price": ONE_NEAR,
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_price",
        json!({
            "type": "update_price",
            "scarce_contract_id": contract.id().to_string(),
            "token_id": tok_list,
            "price": "1100000000000000000000000",
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "delist_native_scarce",
        json!({ "type": "delist_native_scarce", "token_id": tok_list }),
        ONE_YOCTO,
    )
    .await?;
    list_native_scarce(&contract, &creator, &tok_list, ONE_NEAR, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "purchase_native_scarce",
        json!({ "type": "purchase_native_scarce", "token_id": tok_list }),
        NearToken::from_near(2),
    )
    .await?;

    // Offers
    quick_mint(&contract, &creator, "cov-offer", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_offer = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "make_offer",
        json!({
            "type": "make_offer",
            "token_id": tok_offer,
            "amount": HALF_NEAR,
        }),
        NearToken::from_millinear(500),
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "cancel_offer",
        json!({ "type": "cancel_offer", "token_id": tok_offer }),
        ONE_YOCTO,
    )
    .await?;
    make_offer(
        &contract,
        &buyer,
        &tok_offer,
        HALF_NEAR,
        None,
        NearToken::from_millinear(500),
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "accept_offer",
        json!({
            "type": "accept_offer",
            "token_id": tok_offer,
            "buyer_id": buyer.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;

    // Auction: cancel one, settle another
    quick_mint(&contract, &creator, "cov-auc-c", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_auc_c = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "list_native_scarce_auction",
        json!({
            "type": "list_native_scarce_auction",
            "token_id": tok_auc_c,
            "reserve_price": ONE_NEAR,
            "min_bid_increment": HALF_NEAR,
            "auction_duration_ns": 5_000_000_000u64,
            "anti_snipe_extension_ns": 0,
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "cancel_auction",
        json!({ "type": "cancel_auction", "token_id": tok_auc_c }),
        ONE_YOCTO,
    )
    .await?;

    quick_mint(&contract, &creator, "cov-auc-s", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_auc_s = last_token(&contract, &creator).await?;
    list_native_scarce_auction(
        &contract,
        &creator,
        &tok_auc_s,
        ONE_NEAR,
        HALF_NEAR,
        Some(5_000_000_000),
        None,
        None,
        0,
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "place_bid",
        json!({
            "type": "place_bid",
            "token_id": tok_auc_s,
            "amount": ONE_NEAR,
        }),
        NearToken::from_near(2),
    )
    .await?;
    // 100 sandbox blocks ≈ 2 minutes — enough for a 5s deferred-start auction.
    worker.fast_forward(100).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "settle_auction",
        json!({ "type": "settle_auction", "token_id": tok_auc_s }),
        DEPOSIT_STORAGE,
    )
    .await?;

    // --- Collections ---
    let now_ns = worker.view_block().await?.timestamp();
    let door_ms = now_ns / 1_000_000 + 60_000;
    hit(
        &mut seen,
        &contract,
        &creator,
        "create_collection",
        json!({
            "type": "create_collection",
            "collection_id": TICKET_COL,
            "total_supply": 8,
            "metadata_template": json!({
                "title": "T #{seat_number}",
                "expires_at": door_ms,
                "extra": json!({"kind":"ticket","eventEndsAt": door_ms}).to_string(),
            }).to_string(),
            "price_near": ONE_NEAR,
            "transferable": true,
            "burnable": true,
            "renewable": true,
            "max_redeems": 1,
        }),
        DEPOSIT_LARGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_collection_price",
        json!({
            "type": "update_collection_price",
            "collection_id": TICKET_COL,
            "new_price_near": ONE_NEAR,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_collection_timing",
        json!({
            "type": "update_collection_timing",
            "collection_id": TICKET_COL,
            "start_time": null,
            "end_time": null,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "set_collection_metadata",
        json!({
            "type": "set_collection_metadata",
            "collection_id": TICKET_COL,
            "metadata": "{\"title\":\"covered\"}",
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "mint_from_collection",
        json!({
            "type": "mint_from_collection",
            "collection_id": TICKET_COL,
            "quantity": 1,
            "receiver_id": buyer.id().to_string(),
        }),
        DEPOSIT_LARGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "airdrop_from_collection",
        json!({
            "type": "airdrop_from_collection",
            "collection_id": TICKET_COL,
            "receivers": [staff.id().to_string()],
        }),
        DEPOSIT_LARGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "purchase_from_collection",
        json!({
            "type": "purchase_from_collection",
            "collection_id": TICKET_COL,
            "quantity": 1,
            "max_price_per_token": ONE_NEAR,
        }),
        NearToken::from_near(2),
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "set_allowlist",
        json!({
            "type": "set_allowlist",
            "collection_id": TICKET_COL,
            "entries": [{ "account_id": extra.id().to_string(), "allocation": 1 }],
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "remove_from_allowlist",
        json!({
            "type": "remove_from_allowlist",
            "collection_id": TICKET_COL,
            "accounts": [extra.id().to_string()],
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "pause_collection",
        json!({ "type": "pause_collection", "collection_id": TICKET_COL }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "resume_collection",
        json!({ "type": "resume_collection", "collection_id": TICKET_COL }),
        ONE_YOCTO,
    )
    .await?;

    hit(
        &mut seen,
        &contract,
        &creator,
        "add_redeemer",
        json!({
            "type": "add_redeemer",
            "collection_id": TICKET_COL,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "remove_redeemer",
        json!({
            "type": "remove_redeemer",
            "collection_id": TICKET_COL,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "set_redeemers",
        json!({
            "type": "set_redeemers",
            "collection_id": TICKET_COL,
            "account_ids": [staff.id().to_string()],
        }),
        ONE_YOCTO,
    )
    .await?;

    let ticket_ids = nft_tokens_for_owner(&contract, &buyer.id().to_string(), None, Some(20)).await?;
    let ticket = ticket_ids
        .iter()
        .find(|t| t.token_id.starts_with(&format!("{TICKET_COL}:")))
        .unwrap()
        .token_id
        .clone();
    let later_ms = worker.view_block().await?.timestamp() / 1_000_000 + 120_000;
    hit(
        &mut seen,
        &contract,
        &creator,
        "renew_token",
        json!({
            "type": "renew_token",
            "token_id": ticket,
            "collection_id": TICKET_COL,
            "new_expires_at": later_ms * 1_000_000,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_collection_template_expiry",
        json!({
            "type": "update_collection_template_expiry",
            "collection_id": TICKET_COL,
            "expires_at_ms": later_ms,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &staff,
        "redeem_token",
        json!({
            "type": "redeem_token",
            "token_id": ticket,
            "collection_id": TICKET_COL,
        }),
        ONE_YOCTO,
    )
    .await?;

    // Invalidate + refund collection
    create_collection_with_options(
        &contract,
        &creator,
        INV_COL,
        4,
        "0",
        json!({ "title": "inv #{seat_number}" }),
        "invalidate",
        Some(1),
        false,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    mint_from_collection(
        &contract,
        &creator,
        INV_COL,
        1,
        Some(&buyer.id().to_string()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "revoke_token",
        json!({
            "type": "revoke_token",
            "token_id": format!("{INV_COL}:1"),
            "collection_id": INV_COL,
            "memo": "coverage",
        }),
        ONE_YOCTO,
    )
    .await?;

    create_collection(
        &contract,
        &creator,
        PLAIN_COL,
        4,
        "0",
        json!({ "title": "plain #{seat_number}" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    mint_from_collection(
        &contract,
        &creator,
        PLAIN_COL,
        1,
        Some(&buyer.id().to_string()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &extra,
        "make_collection_offer",
        json!({
            "type": "make_collection_offer",
            "collection_id": PLAIN_COL,
            "amount": HALF_NEAR,
        }),
        NearToken::from_millinear(500),
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &extra,
        "cancel_collection_offer",
        json!({
            "type": "cancel_collection_offer",
            "collection_id": PLAIN_COL,
        }),
        ONE_YOCTO,
    )
    .await?;
    make_collection_offer(
        &contract,
        &extra,
        PLAIN_COL,
        HALF_NEAR,
        None,
        NearToken::from_millinear(500),
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "accept_collection_offer",
        json!({
            "type": "accept_collection_offer",
            "collection_id": PLAIN_COL,
            "token_id": format!("{PLAIN_COL}:1"),
            "buyer_id": extra.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;

    // Cancel + refund leftover
    mint_from_collection(
        &contract,
        &creator,
        PLAIN_COL,
        1,
        Some(&buyer.id().to_string()),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "cancel_collection",
        json!({
            "type": "cancel_collection",
            "collection_id": PLAIN_COL,
            "refund_per_token": HALF_NEAR,
            "refund_deadline_ns": 5_000_000_000u64,
        }),
        NearToken::from_near(1),
    )
    .await?;
    let leftover = nft_tokens_for_owner(&contract, &buyer.id().to_string(), None, Some(20))
        .await?
        .into_iter()
        .find(|t| t.token_id.starts_with(&format!("{PLAIN_COL}:")))
        .unwrap()
        .token_id;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "claim_refund",
        json!({
            "type": "claim_refund",
            "token_id": leftover,
            "collection_id": PLAIN_COL,
        }),
        ONE_YOCTO,
    )
    .await?;
    // Second unused seat on PLAIN after extra accepted offer? minted 2, extra owns :1,
    // buyer owns :2. cancel pool was 1 token if extra's token also unused...
    // minted 2, fully_redeemed 0 → pool needed 1 NEAR but we deposited 0.5.
    // FIX: only one unused we intend to claim. After accept, extra owns :1, buyer :2.
    // cancel refundable = 2. Need 1 NEAR deposit.
    // extra still holds PLAIN:1 unclaimed; wait out the 5s sandbox claim window.
    worker.fast_forward(100).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "withdraw_unclaimed_refunds",
        json!({
            "type": "withdraw_unclaimed_refunds",
            "collection_id": PLAIN_COL,
        }),
        ONE_YOCTO,
    )
    .await?;

    create_collection(
        &contract,
        &creator,
        EMPTY_COL,
        3,
        "0",
        json!({ "title": "empty" }),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "delete_collection",
        json!({ "type": "delete_collection", "collection_id": EMPTY_COL }),
        ONE_YOCTO,
    )
    .await?;

    // Lazy listings
    hit(
        &mut seen,
        &contract,
        &creator,
        "create_lazy_listing",
        json!({
            "type": "create_lazy_listing",
            "metadata": { "title": "lazy-buy" },
            "price": ONE_NEAR,
            "transferable": true,
            "burnable": true,
        }),
        DEPOSIT_LARGE,
    )
    .await?;
    create_lazy_listing(
        &contract,
        &creator,
        json!({ "title": "lazy-cancel" }),
        ONE_NEAR,
        true,
        true,
        None,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    let listings = get_lazy_listings_by_creator(&contract, &creator.id().to_string()).await?;
    let buy_ll = listings
        .iter()
        .find(|(_, r)| r.metadata.title.as_deref() == Some("lazy-buy"))
        .map(|(id, _)| id.clone())
        .expect("lazy-buy");
    let cancel_ll = listings
        .iter()
        .find(|(_, r)| r.metadata.title.as_deref() == Some("lazy-cancel"))
        .map(|(id, _)| id.clone())
        .expect("lazy-cancel");
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_lazy_listing_price",
        json!({
            "type": "update_lazy_listing_price",
            "listing_id": buy_ll,
            "new_price": ONE_NEAR,
        }),
        ONE_YOCTO,
    )
    .await?;
    let far = worker.view_block().await?.timestamp() + 86_400_000_000_000;
    hit(
        &mut seen,
        &contract,
        &creator,
        "update_lazy_listing_expiry",
        json!({
            "type": "update_lazy_listing_expiry",
            "listing_id": buy_ll,
            "new_expires_at": far,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &buyer,
        "purchase_lazy_listing",
        json!({ "type": "purchase_lazy_listing", "listing_id": buy_ll }),
        NearToken::from_near(2),
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "cancel_lazy_listing",
        json!({ "type": "cancel_lazy_listing", "listing_id": cancel_ll }),
        ONE_YOCTO,
    )
    .await?;

    // App + moderation
    hit(
        &mut seen,
        &contract,
        &creator,
        "register_app",
        json!({ "type": "register_app", "app_id": APP }),
        DEPOSIT_LARGE,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "fund_app_pool",
        json!({ "type": "fund_app_pool", "app_id": APP }),
        NearToken::from_near(1),
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "set_app_config",
        json!({ "type": "set_app_config", "app_id": APP, "metadata": "{\"name\":\"cov\"}" }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "add_moderator",
        json!({
            "type": "add_moderator",
            "app_id": APP,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "remove_moderator",
        json!({
            "type": "remove_moderator",
            "app_id": APP,
            "account_id": staff.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "add_approved_creator",
        json!({
            "type": "add_approved_creator",
            "app_id": APP,
            "account_id": extra.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "add_approved_creators",
        json!({
            "type": "add_approved_creators",
            "app_id": APP,
            "account_ids": [buyer.id().to_string()],
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "remove_approved_creator",
        json!({
            "type": "remove_approved_creator",
            "app_id": APP,
            "account_id": extra.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    create_collection_for_app(
        &contract,
        &creator,
        "cov-app-col",
        3,
        "0",
        json!({ "title": "appc" }),
        APP,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "set_collection_app_metadata",
        json!({
            "type": "set_collection_app_metadata",
            "app_id": APP,
            "collection_id": "cov-app-col",
            "metadata": "{\"blurb\":\"ok\"}",
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "ban_collection",
        json!({
            "type": "ban_collection",
            "app_id": APP,
            "collection_id": "cov-app-col",
            "reason": "coverage",
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "unban_collection",
        json!({
            "type": "unban_collection",
            "app_id": APP,
            "collection_id": "cov-app-col",
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "withdraw_app_pool",
        json!({
            "type": "withdraw_app_pool",
            "app_id": APP,
            "amount": HALF_NEAR,
        }),
        ONE_YOCTO,
    )
    .await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "transfer_app_ownership",
        json!({
            "type": "transfer_app_ownership",
            "app_id": APP,
            "new_owner": extra.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;

    fund_platform_storage(&contract, &owner, NearToken::from_near(1))
        .await?
        .into_result()?;
    hit(
        &mut seen,
        &contract,
        &owner,
        "withdraw_platform_storage",
        json!({
            "type": "withdraw_platform_storage",
            "amount": HALF_NEAR,
        }),
        ONE_YOCTO,
    )
    .await?;

    quick_mint(&contract, &creator, "cov-burn", DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tok_burn = last_token(&contract, &creator).await?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "burn_scarce",
        json!({ "type": "burn_scarce", "token_id": tok_burn }),
        ONE_YOCTO,
    )
    .await?;

    // External delist
    let nft_source = deploy_scarces(&worker, &owner).await?;
    owner
        .call(contract.id(), "add_approved_nft_contract")
        .args_json(json!({ "nft_contract_id": nft_source.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    storage_deposit(&nft_source, &creator, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(&nft_source, &creator, "ext", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let ext_id = last_token(&nft_source, &creator).await?;
    creator
        .call(nft_source.id(), "nft_approve")
        .args_json(json!({
            "token_id": ext_id,
            "account_id": contract.id().to_string(),
            "msg": json!({ "sale_conditions": ONE_NEAR }).to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    hit(
        &mut seen,
        &contract,
        &creator,
        "delist_scarce",
        json!({
            "type": "delist_scarce",
            "scarce_contract_id": nft_source.id().to_string(),
            "token_id": ext_id,
        }),
        ONE_YOCTO,
    )
    .await?;

    let missing: Vec<_> = ALL_EXECUTE_TYPES
        .iter()
        .copied()
        .filter(|ty| !seen.contains(ty))
        .collect();
    assert!(
        missing.is_empty(),
        "execute types not hit on-chain: {missing:?}"
    );
    println!(
        "all {} execute action types succeeded on-chain",
        ALL_EXECUTE_TYPES.len()
    );
    Ok(())
}
