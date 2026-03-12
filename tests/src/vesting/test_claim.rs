// =============================================================================
// Vesting Integration Tests — Funding and Claim Flow
// =============================================================================

use anyhow::Result;

use super::helpers::*;

#[tokio::test]
async fn test_claim_transfers_full_amount_after_short_schedule() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;

    let storage_before = storage_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert!(
        storage_before.is_none(),
        "beneficiary should not be FT-registered before claim"
    );

    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;

    worker.fast_forward(5).await?;

    let status_before_claim = get_status(&vesting).await?;
    assert_eq!(status_before_claim.claimable_amount, VESTING_TOTAL.to_string());

    let result = claim_vesting(&vesting, &beneficiary).await?;
    assert!(result.is_success(), "claim should succeed: {:?}", result);

    let beneficiary_balance = ft_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert_eq!(beneficiary_balance, VESTING_TOTAL);

    let storage_after = storage_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert!(
        storage_after.is_some(),
        "beneficiary should be auto-registered on FT during claim"
    );

    let status_after_claim = get_status(&vesting).await?;
    assert_eq!(status_after_claim.claimed_amount, VESTING_TOTAL.to_string());
    assert_eq!(status_after_claim.claimable_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_claim_before_cliff_fails_without_time_jump() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        now_ns,
        now_ns + 10_000_000_000,
        now_ns + 20_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;
    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;

    let result = claim_vesting(&vesting, &beneficiary).await?;
    assert!(result.is_failure(), "claim before cliff should fail");

    let beneficiary_balance = ft_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert_eq!(beneficiary_balance, 0);

    let status = get_status(&vesting).await?;
    assert_eq!(status.claimed_amount, "0");
    assert_eq!(status.claimable_amount, "0");

    Ok(())
}

#[tokio::test]
async fn test_claim_rolls_back_when_ft_transfer_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;
    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;
    worker.fast_forward(5).await?;

    set_fail_next_transfer(&ft, &owner, true).await?;

    let result = claim_vesting(&vesting, &beneficiary).await?;
    assert!(result.is_success(), "claim callback should handle FT failure: {:?}", result);

    let beneficiary_balance = ft_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert_eq!(beneficiary_balance, 0);

    let status = get_status(&vesting).await?;
    assert_eq!(status.claimed_amount, "0");
    assert_eq!(status.claimable_amount, VESTING_TOTAL.to_string());

    Ok(())
}

#[tokio::test]
async fn test_non_owner_funding_attempt_does_not_fund_contract() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let attacker = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;
    mint_ft(&ft, &owner, attacker.id(), VESTING_TOTAL).await?;

    let result = attacker
        .call(ft.id(), "ft_transfer_call")
        .args_json(serde_json::json!({
            "receiver_id": vesting.id().to_string(),
            "amount": VESTING_TOTAL.to_string(),
            "msg": "",
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;

    assert!(result.is_success(), "mock FT masks receiver failure via refund: {:?}", result);

    let config = get_config(&vesting).await?;
    assert!(!config.funded);

    let attacker_balance = ft_balance_of(&ft, attacker.id().as_str()).await?;
    assert_eq!(attacker_balance, VESTING_TOTAL);

    Ok(())
}

#[tokio::test]
async fn test_wrong_token_funding_attempt_does_not_fund_contract() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let social_ft = deploy_mock_ft(&worker, &owner).await?;
    let wrong_ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &social_ft,
        &beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&wrong_ft, &owner, vesting.id()).await?;

    let result = fund_vesting(&wrong_ft, &owner, &vesting, VESTING_TOTAL).await?;
    assert!(
        result.is_success(),
        "mock FT masks receiver failure via refund: {:?}",
        result
    );

    let config = get_config(&vesting).await?;
    assert!(!config.funded);

    let owner_balance = ft_balance_of(&wrong_ft, owner.id().as_str()).await?;
    assert_eq!(owner_balance, TOTAL_SUPPLY);

    Ok(())
}

#[tokio::test]
async fn test_beneficiary_rotation_moves_claim_rights() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let old_beneficiary = worker.dev_create_account().await?;
    let new_beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &old_beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;
    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;
    set_beneficiary(&vesting, &owner, &new_beneficiary)
        .await?
        .into_result()?;

    worker.fast_forward(5).await?;

    let old_claim = claim_vesting(&vesting, &old_beneficiary).await?;
    assert!(old_claim.is_failure(), "old beneficiary should lose claim access");

    let new_claim = claim_vesting(&vesting, &new_beneficiary).await?;
    assert!(new_claim.is_success(), "new beneficiary should be able to claim");

    let old_balance = ft_balance_of(&ft, old_beneficiary.id().as_str()).await?;
    let new_balance = ft_balance_of(&ft, new_beneficiary.id().as_str()).await?;
    assert_eq!(old_balance, 0);
    assert_eq!(new_balance, VESTING_TOTAL);

    Ok(())
}

#[tokio::test]
async fn test_second_claim_after_success_fails_without_extra_transfer() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        now_ns,
        now_ns + 1_000_000_000,
        now_ns + 2_000_000_000,
    )
    .await?;

    ft_register(&ft, &owner, vesting.id()).await?;
    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;
    worker.fast_forward(5).await?;

    let first_claim = claim_vesting(&vesting, &beneficiary).await?;
    assert!(first_claim.is_success(), "first claim should succeed: {:?}", first_claim);

    let balance_after_first = ft_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert_eq!(balance_after_first, VESTING_TOTAL);

    let second_claim = claim_vesting(&vesting, &beneficiary).await?;
    assert!(
        second_claim.is_failure(),
        "second claim should fail once claimable is exhausted"
    );

    let balance_after_second = ft_balance_of(&ft, beneficiary.id().as_str()).await?;
    assert_eq!(balance_after_second, VESTING_TOTAL);

    let status = get_status(&vesting).await?;
    assert_eq!(status.claimed_amount, VESTING_TOTAL.to_string());
    assert_eq!(status.claimable_amount, "0");

    Ok(())
}