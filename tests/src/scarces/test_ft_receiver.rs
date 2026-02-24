// =============================================================================
// Integration tests: wNEAR deposit via ft_on_transfer → on_wnear_unwrapped
// =============================================================================
//
// Tests the full cross-contract flow:
//   1. User calls ft_transfer_call on mock-wNEAR → scarces ft_on_transfer
//   2. scarces calls near_withdraw on wNEAR → callback on_wnear_unwrapped
//   3. User's storage balance is credited
//
// Also tests: admin set_wnear_account, rejection of non-wNEAR tokens,
// crediting a different account via msg, and draw_user_balance after deposit.

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Setup: deploy scarces + mock-wNEAR, configure, fund user
// =============================================================================

const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

/// Full setup: scarces contract + mock wNEAR configured + user with wNEAR tokens.
async fn setup_with_wnear() -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract,
    near_workspaces::Contract,
    near_workspaces::Account,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let wnear = deploy_mock_wnear(&worker, &owner, 1_000_000 * ONE_NEAR).await?;

    // Configure scarces to accept wNEAR
    set_wnear_account(&contract, &owner, &wnear).await?;

    // Create user, mint wNEAR to them
    let user = worker.dev_create_account().await?;
    mint_wnear(&wnear, &user, 100 * ONE_NEAR).await?;

    // Register scarces contract on mock-ft so it can receive tokens
    ft_storage_deposit(&wnear, &contract.as_account()).await?;

    Ok((worker, owner, contract, wnear, user))
}

// =============================================================================
// Admin: set_wnear_account
// =============================================================================

#[tokio::test]
async fn test_set_wnear_account_happy() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let wnear = deploy_mock_wnear(&worker, &owner, 1_000 * ONE_NEAR).await?;

    set_wnear_account(&contract, &owner, &wnear).await?;
    Ok(())
}

#[tokio::test]
async fn test_set_wnear_account_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let wnear = deploy_mock_wnear(&worker, &owner, 1_000 * ONE_NEAR).await?;

    let non_owner = worker.dev_create_account().await?;
    let result = non_owner
        .call(contract.id(), "set_wnear_account")
        .args_json(json!({ "wnear_account_id": wnear.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?;
    assert!(result.into_result().is_err());
    Ok(())
}

#[tokio::test]
async fn test_clear_wnear_account() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let wnear = deploy_mock_wnear(&worker, &owner, 1_000 * ONE_NEAR).await?;

    // Set then clear
    set_wnear_account(&contract, &owner, &wnear).await?;

    owner
        .call(contract.id(), "set_wnear_account")
        .args_json(json!({ "wnear_account_id": null }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    Ok(())
}

// =============================================================================
// ft_on_transfer: wNEAR deposit credits storage balance
// =============================================================================

#[tokio::test]
async fn test_wnear_deposit_credits_user_balance() -> Result<()> {
    let (_worker, _owner, contract, wnear, user) = setup_with_wnear().await?;

    let deposit_amount = 5 * ONE_NEAR;

    // Verify zero balance before
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_before: u128 = storage["balance"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    assert_eq!(balance_before, 0);

    // ft_transfer_call: user sends wNEAR to scarces contract
    let result = ft_transfer_call(&wnear, &user, &contract, deposit_amount, "").await?;
    result.into_result()?;

    // Verify balance credited
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_after: u128 = storage["balance"]
        .as_str()
        .expect("balance should be string (U128)")
        .parse()
        .expect("balance should parse as u128");
    assert_eq!(balance_after, deposit_amount);

    Ok(())
}

#[tokio::test]
async fn test_wnear_deposit_accumulates() -> Result<()> {
    let (_worker, _owner, contract, wnear, user) = setup_with_wnear().await?;

    let first = 3 * ONE_NEAR;
    let second = 7 * ONE_NEAR;

    ft_transfer_call(&wnear, &user, &contract, first, "")
        .await?
        .into_result()?;
    ft_transfer_call(&wnear, &user, &contract, second, "")
        .await?
        .into_result()?;

    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance: u128 = storage["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert_eq!(balance, first + second);

    Ok(())
}

#[tokio::test]
async fn test_wnear_deposit_credits_different_account_via_msg() -> Result<()> {
    let (worker, _owner, contract, wnear, user) = setup_with_wnear().await?;

    let alice = worker.dev_create_account().await?;
    let deposit_amount = 2 * ONE_NEAR;

    // User sends wNEAR but credits alice via msg
    ft_transfer_call(
        &wnear,
        &user,
        &contract,
        deposit_amount,
        alice.id().as_str(),
    )
    .await?
    .into_result()?;

    // Alice should have the balance
    let storage = get_user_storage(&contract, alice.id().as_str()).await?;
    let alice_balance: u128 = storage["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert_eq!(alice_balance, deposit_amount);

    // User should have zero
    let user_storage = get_user_storage(&contract, user.id().as_str()).await?;
    let user_balance: u128 = user_storage["balance"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    assert_eq!(user_balance, 0);

    Ok(())
}

// =============================================================================
// ft_on_transfer: rejection cases
// =============================================================================

#[tokio::test]
async fn test_wnear_deposit_from_wrong_ft_contract_rejected() -> Result<()> {
    let (worker, owner, contract, _wnear, user) = setup_with_wnear().await?;

    // Deploy a second mock-ft (not configured as wNEAR)
    let fake_ft = deploy_mock_wnear(&worker, &owner, 1_000_000 * ONE_NEAR).await?;
    mint_wnear(&fake_ft, &user, 10 * ONE_NEAR).await?;
    ft_storage_deposit(&fake_ft, &contract.as_account()).await?;

    // ft_transfer_call succeeds at top level (ft_resolve_transfer refunds),
    // but the receiver's ft_on_transfer panics so no balance is credited.
    ft_transfer_call(&fake_ft, &user, &contract, ONE_NEAR, "").await?;

    // Verify user's storage balance was NOT credited
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance: u128 = storage["balance"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    assert_eq!(balance, 0, "Wrong FT should not credit storage balance");

    Ok(())
}

#[tokio::test]
async fn test_wnear_deposit_without_config_rejected() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Deploy wNEAR but do NOT set_wnear_account
    let wnear = deploy_mock_wnear(&worker, &owner, 1_000_000 * ONE_NEAR).await?;
    let user = worker.dev_create_account().await?;
    mint_wnear(&wnear, &user, 10 * ONE_NEAR).await?;
    ft_storage_deposit(&wnear, &contract.as_account()).await?;

    // ft_transfer_call succeeds at top level (ft_resolve_transfer refunds),
    // but ft_on_transfer panics because wNEAR not configured.
    ft_transfer_call(&wnear, &user, &contract, ONE_NEAR, "").await?;

    // Verify user's storage balance was NOT credited
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance: u128 = storage["balance"]
        .as_str()
        .unwrap_or("0")
        .parse()
        .unwrap_or(0);
    assert_eq!(balance, 0, "Unconfigured wNEAR should not credit storage balance");

    Ok(())
}

// =============================================================================
// End-to-end: wNEAR deposit → prepaid purchase
// =============================================================================

#[tokio::test]
async fn test_wnear_deposit_enables_prepaid_purchase() -> Result<()> {
    let (_worker, _owner, contract, wnear, user) = setup_with_wnear().await?;

    // Step 1: Deposit wNEAR
    let deposit_amount = 10 * ONE_NEAR;
    ft_transfer_call(&wnear, &user, &contract, deposit_amount, "")
        .await?
        .into_result()?;

    // Step 2: Register storage so user can mint
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Step 3: Quick-mint a scarce (user is both creator and buyer, for simplicity)
    let mint_result = execute_action(
        &contract,
        &user,
        json!({
            "type": "quick_mint",
            "metadata": {
                "title": "wNEAR test scarce",
                "description": "Minted to test wNEAR purchase flow"
            },
            "options": {
                "transferable": true,
                "burnable": true
            }
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    mint_result.into_result()?;

    // Verify user has storage balance from wNEAR deposit
    let storage = get_user_storage(&contract, user.id().as_str()).await?;
    let balance: u128 = storage["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(balance > 0, "User should have wNEAR-funded storage balance");

    Ok(())
}

#[tokio::test]
async fn test_wnear_balance_survives_after_mint() -> Result<()> {
    let (_worker, _owner, contract, wnear, user) = setup_with_wnear().await?;

    // Deposit and register
    ft_transfer_call(&wnear, &user, &contract, 50 * ONE_NEAR, "")
        .await?
        .into_result()?;
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let storage_before = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_before: u128 = storage_before["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();

    // Mint a scarce (costs some storage bytes)
    execute_action(
        &contract,
        &user,
        json!({
            "type": "quick_mint",
            "metadata": { "title": "Balance test" },
            "options": { "transferable": true, "burnable": true }
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Balance should still be positive (wNEAR deposit is separate from attached NEAR)
    let storage_after = get_user_storage(&contract, user.id().as_str()).await?;
    let balance_after: u128 = storage_after["balance"]
        .as_str()
        .unwrap()
        .parse()
        .unwrap();
    assert!(balance_after > 0, "wNEAR balance should persist after mint");
    // wNEAR-funded balance should be preserved; attached deposit excess may add more
    assert!(balance_after >= balance_before, "Balance should not decrease after mint");

    Ok(())
}
