// =============================================================================
// Vesting Integration Tests — Views
// =============================================================================

use anyhow::Result;

use super::helpers::*;

#[tokio::test]
async fn test_views_expose_expected_config_and_funded_status() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let beneficiary = worker.dev_create_account().await?;
    let ft = deploy_mock_ft(&worker, &owner).await?;

    let now_ns = now_nanos(&worker).await?;
    let start_at_ns = now_ns;
    let cliff_at_ns = now_ns + 3_000_000_000;
    let end_at_ns = now_ns + 9_000_000_000;

    let vesting = deploy_vesting(
        &worker,
        &owner,
        &ft,
        &beneficiary,
        start_at_ns,
        cliff_at_ns,
        end_at_ns,
    )
    .await?;

    let config_before = get_config(&vesting).await?;
    assert_eq!(config_before.owner_id, owner.id().to_string());
    assert_eq!(config_before.token_id, ft.id().to_string());
    assert_eq!(config_before.beneficiary_id, beneficiary.id().to_string());
    assert_eq!(config_before.total_amount, VESTING_TOTAL.to_string());
    assert_eq!(config_before.claimed_amount, "0");
    assert_eq!(config_before.start_at_ns, start_at_ns);
    assert_eq!(config_before.cliff_at_ns, cliff_at_ns);
    assert_eq!(config_before.end_at_ns, end_at_ns);
    assert!(!config_before.funded);

    ft_register(&ft, &owner, vesting.id()).await?;
    fund_vesting(&ft, &owner, &vesting, VESTING_TOTAL)
        .await?
        .into_result()?;

    let config_after = get_config(&vesting).await?;
    assert!(config_after.funded);

    let status = get_status(&vesting).await?;
    assert_eq!(status.total_amount, VESTING_TOTAL.to_string());
    assert_eq!(status.claimed_amount, "0");
    assert_eq!(status.vested_amount, "0");
    assert_eq!(status.claimable_amount, "0");
    assert_eq!(status.unvested_amount, VESTING_TOTAL.to_string());
    assert!(status.funded);
    assert!(status.now_ns >= start_at_ns);

    Ok(())
}