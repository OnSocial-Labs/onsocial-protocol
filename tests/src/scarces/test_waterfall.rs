// =============================================================================
// Integration tests: 3-tier storage waterfall
// =============================================================================
//
// The waterfall charges storage bytes in priority order:
//   Tier 1: App Pool     — app developer pre-funds storage for their users
//   Tier 2: Platform Pool — platform-wide subsidy (only for non-app operations)
//   Tier 3: User Balance  — user's own prepaid storage balance
//
// Tests cover each tier individually, cascade between tiers, and release/refund.

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

// =============================================================================
// Setup helpers
// =============================================================================

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

/// Register an app pool with a specific max_user_bytes and fund it.
async fn setup_app_pool(
    contract: &near_workspaces::Contract,
    app_owner: &near_workspaces::Account,
    max_user_bytes: Option<u64>,
    fund_amount: NearToken,
) -> Result<String> {
    let app_id = app_owner.id().to_string();
    let mut action = json!({
        "type": "register_app",
        "app_id": app_id,
    });
    if let Some(max) = max_user_bytes {
        action["max_user_bytes"] = json!(max);
    }
    execute_action(contract, app_owner, action, fund_amount)
        .await?
        .into_result()?;
    Ok(app_id)
}

/// Mint a scarce with an app_id context (triggers Tier 1 waterfall).
async fn mint_with_app(
    contract: &near_workspaces::Contract,
    user: &near_workspaces::Account,
    app_id: &str,
    title: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        user,
        json!({
            "type": "quick_mint",
            "metadata": { "title": title },
            "transferable": true,
            "burnable": true,
            "app_id": app_id
        }),
        DEPOSIT_STORAGE,
    )
    .await
}

/// Mint a scarce WITHOUT app_id (triggers Tier 2 or Tier 3 waterfall).
async fn mint_without_app(
    contract: &near_workspaces::Contract,
    user: &near_workspaces::Account,
    title: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        user,
        json!({
            "type": "quick_mint",
            "metadata": { "title": title },
            "transferable": true,
            "burnable": true
        }),
        DEPOSIT_STORAGE,
    )
    .await
}

// =============================================================================
// Tier 1: App Pool pays for storage
// =============================================================================

#[tokio::test]
async fn test_tier1_app_pool_covers_mint_cost() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    // Register app pool with generous funding
    let app_id = setup_app_pool(&contract, &app_owner, None, DEPOSIT_LARGE).await?;

    let pool_before = get_app_pool(&contract, &app_id).await?.unwrap();
    let pool_balance_before: u128 = pool_before.balance.parse().unwrap();

    // User mints with app context — app pool should pay
    let user = user_with_storage(&worker, &contract).await?;
    let user_storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let user_balance_before: u128 = user_storage_before["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    mint_with_app(&contract, &user, &app_id, "App-funded scarce")
        .await?
        .into_result()?;

    // App pool balance should decrease
    let pool_after = get_app_pool(&contract, &app_id).await?.unwrap();
    let pool_balance_after: u128 = pool_after.balance.parse().unwrap();
    assert!(
        pool_balance_after < pool_balance_before,
        "App pool balance should decrease after mint (before={}, after={}, used_bytes_before={}, used_bytes_after={}, max_user_bytes={:?})",
        pool_balance_before, pool_balance_after, pool_before.used_bytes, pool_after.used_bytes, pool_after.max_user_bytes
    );
    assert!(pool_after.used_bytes > 0, "App pool used_bytes should increase");

    // User balance should NOT decrease (app pool covered it)
    let user_storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let user_balance_after: u128 = user_storage_after["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(
        user_balance_after >= user_balance_before,
        "User balance should not decrease when app pool covers storage"
    );

    Ok(())
}

#[tokio::test]
async fn test_tier1_app_pool_tracks_per_user_bytes() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    // Register with small max_user_bytes
    let app_id = setup_app_pool(&contract, &app_owner, Some(1_000), DEPOSIT_LARGE).await?;

    let user = user_with_storage(&worker, &contract).await?;

    // First mint: should be covered by app pool (within 1000 byte limit)
    mint_with_app(&contract, &user, &app_id, "First mint")
        .await?
        .into_result()?;

    let pool = get_app_pool(&contract, &app_id).await?.unwrap();
    assert!(
        pool.used_bytes > 0,
        "App pool should track used bytes after first mint"
    );

    Ok(())
}

#[tokio::test]
async fn test_tier1_exhausted_falls_to_tier3_user() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    // Register with very small max_user_bytes (1 byte — effectively immediately exhausted)
    let app_id = setup_app_pool(&contract, &app_owner, Some(1), DEPOSIT_LARGE).await?;

    let user = user_with_storage(&worker, &contract).await?;
    let user_storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used_before: u64 = user_storage_before["used_bytes"].as_u64().unwrap_or(0);

    // Mint with app context — app pool can only cover 1 byte, rest falls to user
    mint_with_app(&contract, &user, &app_id, "Overflow to user tier")
        .await?
        .into_result()?;

    let user_storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used_after: u64 = user_storage_after["used_bytes"].as_u64().unwrap_or(0);

    // User should have some used_bytes (the overflow from app pool)
    assert!(
        user_used_after > user_used_before,
        "User should absorb overflow bytes when app pool max_user_bytes is exhausted"
    );

    Ok(())
}

// =============================================================================
// Tier 2: Platform Pool pays for storage (non-app operations)
// =============================================================================

#[tokio::test]
async fn test_tier2_platform_pool_covers_mint() -> Result<()> {
    let (worker, owner, contract) = setup().await?;

    // Fund platform pool
    fund_platform_storage(&contract, &owner, NearToken::from_near(5))
        .await?
        .into_result()?;

    let platform_before: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();
    assert!(platform_before > 0, "Platform pool should be funded");

    // User mints WITHOUT app_id — should use platform pool
    let user = user_with_storage(&worker, &contract).await?;
    let user_storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used_before: u64 = user_storage_before["used_bytes"].as_u64().unwrap_or(0);

    mint_without_app(&contract, &user, "Platform-funded scarce")
        .await?
        .into_result()?;

    // Platform balance should decrease
    let platform_after: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();
    assert!(
        platform_after < platform_before,
        "Platform pool should decrease when covering non-app storage"
    );

    // User tier2_used_bytes should increase
    let user_storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let tier2_after: u64 = user_storage_after["tier2_used_bytes"].as_u64().unwrap_or(0);
    assert!(
        tier2_after > 0,
        "tier2_used_bytes should track platform-covered bytes"
    );

    // User's own used_bytes should NOT increase (platform paid)
    let user_used_after: u64 = user_storage_after["used_bytes"].as_u64().unwrap_or(0);
    assert_eq!(
        user_used_before, user_used_after,
        "User used_bytes should not increase when platform pool covers cost"
    );

    Ok(())
}

#[tokio::test]
async fn test_tier2_skipped_when_app_id_present() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;

    // Fund platform pool AND register app pool
    fund_platform_storage(&contract, &owner, NearToken::from_near(5))
        .await?
        .into_result()?;
    let app_id = setup_app_pool(&contract, &app_owner, None, DEPOSIT_LARGE).await?;

    let platform_before: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();

    // Mint WITH app_id — should use Tier 1 (app pool), NOT Tier 2 (platform)
    let user = user_with_storage(&worker, &contract).await?;
    mint_with_app(&contract, &user, &app_id, "App mint, not platform")
        .await?
        .into_result()?;

    let platform_after: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();
    assert_eq!(
        platform_before, platform_after,
        "Platform pool should NOT be touched when app_id is present"
    );

    Ok(())
}

#[tokio::test]
async fn test_tier2_exhausted_falls_to_tier3() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;

    // Register a broke app pool (0 balance) so tier 1 fails immediately.
    // Using app_id causes tier 2 (platform pool) to be skipped entirely,
    // so the waterfall falls through to tier 3 (user balance).
    let app_owner = user_with_storage(&worker, &contract).await?;
    let broke_app = setup_app_pool(&contract, &app_owner, Some(50_000), NearToken::from_yoctonear(0)).await?;

    let user = user_with_storage(&worker, &contract).await?;

    // Mint with broke app — tier 1 can't cover (0 balance), tier 2 skipped, falls to tier 3
    mint_with_app(&contract, &user, &broke_app, "User-funded scarce")
        .await?
        .into_result()?;

    let user_storage = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used: u64 = user_storage["used_bytes"].as_u64().unwrap_or(0);
    assert!(
        user_used > 0,
        "User used_bytes should increase when app pool is exhausted"
    );

    Ok(())
}

// =============================================================================
// Tier 3: User balance pays for storage
// =============================================================================

#[tokio::test]
async fn test_tier3_user_balance_covers_mint() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;

    // Register a broke app pool (0 balance) so tier 1 fails and tier 2 is skipped.
    // This forces the waterfall to tier 3 (user balance).
    let app_owner = user_with_storage(&worker, &contract).await?;
    let broke_app = setup_app_pool(&contract, &app_owner, Some(50_000), NearToken::from_yoctonear(0)).await?;

    let user = user_with_storage(&worker, &contract).await?;
    let user_storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used_before: u64 = user_storage_before["used_bytes"].as_u64().unwrap_or(0);

    // Mint with broke app — falls through to tier 3
    mint_with_app(&contract, &user, &broke_app, "User-paid scarce")
        .await?
        .into_result()?;

    let user_storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let user_used_after: u64 = user_storage_after["used_bytes"].as_u64().unwrap_or(0);
    assert!(
        user_used_after > user_used_before,
        "User used_bytes should increase in Tier 3"
    );

    let tier2: u64 = user_storage_after["tier2_used_bytes"].as_u64().unwrap_or(0);
    assert_eq!(tier2, 0, "tier2_used_bytes should be 0 when platform pool is not used");

    Ok(())
}

#[tokio::test]
async fn test_tier3_insufficient_balance_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;

    // Register a broke app pool so tier 2 (platform pool) is skipped.
    let app_owner = user_with_storage(&worker, &contract).await?;
    let broke_app = setup_app_pool(&contract, &app_owner, Some(50_000), NearToken::from_yoctonear(0)).await?;

    // Create user with minimal storage (just enough to register, not enough for mint)
    let user = worker.dev_create_account().await?;
    storage_deposit(&contract, &user, None, NearToken::from_yoctonear(1))
        .await?
        .into_result()?;

    // Mint with broke app + minimal deposit — tier 1 fails (0 balance), tier 2 skipped,
    // tier 3 fails (1 yocto storage + 1 yocto deposit can't cover ~400 bytes × 10^19 yocto/byte)
    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "quick_mint",
            "metadata": { "title": "Should fail" },
            "transferable": true,
            "burnable": true,
            "app_id": broke_app
        }),
        NearToken::from_yoctonear(1),
    )
    .await?;

    assert!(
        result.into_result().is_err(),
        "Mint should fail when user has insufficient storage balance"
    );

    Ok(())
}

// =============================================================================
// Release: storage freed credits back to the correct tier
// =============================================================================

#[tokio::test]
async fn test_release_credits_app_pool_on_burn() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user_with_storage(&worker, &contract).await?;
    let app_id = setup_app_pool(&contract, &app_owner, None, DEPOSIT_LARGE).await?;

    let user = user_with_storage(&worker, &contract).await?;

    // Mint with app context
    mint_with_app(&contract, &user, &app_id, "Will be burned")
        .await?
        .into_result()?;

    let pool_after_mint = get_app_pool(&contract, &app_id).await?.unwrap();
    let pool_balance_after_mint: u128 = pool_after_mint.balance.parse().unwrap();
    let pool_used_after_mint = pool_after_mint.used_bytes;
    assert!(pool_used_after_mint > 0, "App pool should have used_bytes after mint");

    // Get token ID
    let tokens = nft_tokens_for_owner(&contract, user.id().as_str(), None, None).await?;
    let token_id = &tokens[0].token_id;

    // Burn the token — should release storage back to app pool
    execute_action(
        &contract,
        &user,
        json!({
            "type": "burn_scarce",
            "token_id": token_id
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Token should be gone
    let tokens_after = nft_tokens_for_owner(&contract, user.id().as_str(), None, None).await?;
    assert!(tokens_after.is_empty(), "Token should be removed after burn");

    // App pool balance should increase (storage freed → credited back)
    let pool_after_burn = get_app_pool(&contract, &app_id).await?.unwrap();
    assert!(
        pool_after_burn.balance.parse::<u128>().unwrap() > pool_balance_after_mint,
        "App pool balance should increase after burn (was {}, now {})",
        pool_balance_after_mint,
        pool_after_burn.balance
    );
    assert!(
        pool_after_burn.used_bytes < pool_used_after_mint,
        "App pool used_bytes should decrease on burn (was {}, now {})",
        pool_used_after_mint,
        pool_after_burn.used_bytes
    );

    Ok(())
}

#[tokio::test]
async fn test_release_credits_platform_pool_on_burn() -> Result<()> {
    let (worker, owner, contract) = setup().await?;

    // Fund platform pool
    fund_platform_storage(&contract, &owner, NearToken::from_near(5))
        .await?
        .into_result()?;

    let user = user_with_storage(&worker, &contract).await?;

    // Mint without app → Tier 2 covers it
    mint_without_app(&contract, &user, "Platform-funded, will burn")
        .await?
        .into_result()?;

    let platform_after_mint: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();

    let user_storage_after_mint = get_user_storage(&contract, user.id().as_str()).await?;
    let tier2_after_mint: u64 = user_storage_after_mint["tier2_used_bytes"]
        .as_u64()
        .unwrap_or(0);
    assert!(tier2_after_mint > 0, "tier2_used_bytes should be > 0 after platform-funded mint");

    // Get token and burn
    let tokens = nft_tokens_for_owner(&contract, user.id().as_str(), None, None).await?;
    let token_id = &tokens[0].token_id;

    execute_action(
        &contract,
        &user,
        json!({
            "type": "burn_scarce",
            "token_id": token_id
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Token should be gone
    let tokens_after = nft_tokens_for_owner(&contract, user.id().as_str(), None, None).await?;
    assert!(tokens_after.is_empty(), "Token should be removed after burn");

    // Platform pool should be credited back
    let platform_after_burn: u128 = get_platform_storage_balance(&contract)
        .await?
        .parse()
        .unwrap();
    assert!(
        platform_after_burn > platform_after_mint,
        "Platform pool should increase after burn (was {}, now {})",
        platform_after_mint,
        platform_after_burn
    );

    // tier2_used_bytes should decrease
    let user_storage_after_burn = get_user_storage(&contract, user.id().as_str()).await?;
    let tier2_after_burn: u64 = user_storage_after_burn["tier2_used_bytes"]
        .as_u64()
        .unwrap_or(0);
    assert!(
        tier2_after_burn < tier2_after_mint,
        "tier2_used_bytes should decrease after burn (was {}, now {})",
        tier2_after_mint,
        tier2_after_burn
    );

    Ok(())
}

// =============================================================================
// Spending cap: limits draw_user_balance per transaction
// =============================================================================

#[tokio::test]
async fn test_spending_cap_limits_prepaid_draw() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;

    let user = user_with_storage(&worker, &contract).await?;

    // Give user a large deposit
    storage_deposit(&contract, &user, None, NearToken::from_near(10))
        .await?
        .into_result()?;

    // Set a small spending cap
    execute_action(
        &contract,
        &user,
        json!({
            "type": "set_spending_cap",
            "cap": ONE_NEAR.to_string()
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Verify cap is set
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let cap = storage["spending_cap"]
        .as_str()
        .expect("spending_cap should be set");
    let cap_val: u128 = cap.parse().unwrap();
    assert_eq!(cap_val, ONE_NEAR, "Spending cap should match what was set");

    Ok(())
}

#[tokio::test]
async fn test_spending_cap_can_be_cleared() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    // Set cap
    execute_action(
        &contract,
        &user,
        json!({
            "type": "set_spending_cap",
            "cap": ONE_NEAR.to_string()
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    // Clear cap (null)
    execute_action(
        &contract,
        &user,
        json!({
            "type": "set_spending_cap",
            "cap": null
        }),
        ONE_YOCTO,
    )
    .await?
    .into_result()?;

    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    assert!(
        storage["spending_cap"].is_null(),
        "Spending cap should be cleared"
    );

    Ok(())
}
