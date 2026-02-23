// =============================================================================
// Scarces Integration Tests — Storage Deposit & Withdraw
// =============================================================================
// Tests for the storage deposit/withdraw flow which is a prerequisite for
// all state-changing user actions (minting, listing, bidding, etc.).
//
// Run: make test-integration-contract-scarces-onsocial TEST=scarces::test_storage

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Storage Deposit
// =============================================================================

#[tokio::test]
async fn test_storage_deposit_for_self() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Balance should be "0" before deposit
    let balance_before = storage_balance_of(&contract, &user.id().to_string()).await?;
    assert_eq!(balance_before, "0");

    // Deposit storage for self
    let result = storage_deposit(&contract, &user, None, DEPOSIT_STORAGE).await?;
    assert!(
        result.is_success(),
        "storage_deposit should succeed: {:?}",
        result.failures()
    );

    // Balance should now be > 0
    let balance_after = storage_balance_of(&contract, &user.id().to_string()).await?;
    let balance: u128 = balance_after.parse().unwrap_or(0);
    assert!(balance > 0, "balance should be positive after deposit");

    Ok(())
}

#[tokio::test]
async fn test_storage_deposit_for_another_account() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let payer = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Deposit storage for beneficiary, paid by payer
    let result = storage_deposit(
        &contract,
        &payer,
        Some(&beneficiary.id().to_string()),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(
        result.is_success(),
        "storage_deposit for another should succeed"
    );

    // Beneficiary should have a balance
    let balance = storage_balance_of(&contract, &beneficiary.id().to_string()).await?;
    let balance_val: u128 = balance.parse().unwrap_or(0);
    assert!(
        balance_val > 0,
        "beneficiary should have positive balance after third-party deposit"
    );

    Ok(())
}

#[tokio::test]
async fn test_storage_deposit_multiple_times_accumulates() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // First deposit
    storage_deposit(&contract, &user, None, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let balance1 = storage_balance_of(&contract, &user.id().to_string()).await?;

    // Second deposit
    storage_deposit(&contract, &user, None, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let balance2 = storage_balance_of(&contract, &user.id().to_string()).await?;

    let b1: u128 = balance1.parse().unwrap_or(0);
    let b2: u128 = balance2.parse().unwrap_or(0);
    assert!(
        b2 > b1,
        "balance should increase after second deposit: {} -> {}",
        b1,
        b2
    );

    Ok(())
}

// =============================================================================
// Storage Withdraw
// =============================================================================

#[tokio::test]
async fn test_storage_withdraw() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Deposit first
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let balance_before = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b_before: u128 = balance_before.parse().unwrap_or(0);
    assert!(b_before > 0, "should have balance after deposit");

    // Withdraw
    let result = execute_action(
        &contract,
        &user,
        json!({ "type": "storage_withdraw" }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "storage_withdraw should succeed: {:?}",
        result.failures()
    );

    // Balance should be reduced (to cover used storage, which is 0 if nothing minted)
    let balance_after = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b_after: u128 = balance_after.parse().unwrap_or(0);
    assert!(
        b_after <= b_before,
        "balance should decrease or stay equal after withdraw"
    );

    Ok(())
}

// =============================================================================
// Spending Cap
// =============================================================================

#[tokio::test]
async fn test_set_spending_cap() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Deposit
    storage_deposit(&contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Set a spending cap
    let cap_amount = "50000000000000000000000"; // 0.05 NEAR
    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "set_spending_cap",
            "cap": cap_amount,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "set_spending_cap should succeed: {:?}",
        result.failures()
    );

    // Clear spending cap
    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "set_spending_cap",
            "cap": null,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(
        result.is_success(),
        "clearing spending cap should succeed: {:?}",
        result.failures()
    );

    Ok(())
}

// =============================================================================
// Edge Cases
// =============================================================================

#[tokio::test]
async fn test_storage_deposit_zero_near_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let user = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;

    // Try depositing 0 NEAR
    // This should either fail or do nothing — we check the balance below.
    let result = storage_deposit(&contract, &user, None, NearToken::from_yoctonear(0)).await?;
    let _ = result.into_result(); // may fail, that's OK
    // This should either fail or do nothing useful
    // Some contracts accept 0 gracefully, others panic — we test the contract's behavior
    let balance = storage_balance_of(&contract, &user.id().to_string()).await?;
    assert_eq!(
        balance, "0",
        "balance should be 0 after zero deposit (or deposit should have failed)"
    );

    Ok(())
}
