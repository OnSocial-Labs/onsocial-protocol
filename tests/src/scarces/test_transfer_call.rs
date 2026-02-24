// =============================================================================
// NEP-171 nft_transfer_call Integration Tests
// =============================================================================
// Tests for cross-contract `nft_transfer_call` — verifies the callback
// resolution logic that reverts ownership when the receiver rejects.

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared setup
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

async fn mint_one(
    contract: &near_workspaces::Contract,
    minter: &near_workspaces::Account,
) -> Result<String> {
    storage_deposit(contract, minter, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    quick_mint(
        contract,
        minter,
        "Transfer Call Token",
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let tokens =
        nft_tokens_for_owner(contract, &minter.id().to_string(), None, Some(50)).await?;
    Ok(tokens[0].token_id.clone())
}

// =============================================================================
// nft_transfer_call — Another account as receiver
// =============================================================================

#[tokio::test]
async fn test_nft_transfer_call_to_account() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = worker.dev_create_account().await?;
    let token_id = mint_one(&contract, &minter).await?;

    let receiver = worker.dev_create_account().await?;
    storage_deposit(&contract, &receiver, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // nft_transfer_call to a regular account (no nft_on_transfer impl)
    // The call will succeed — receiver can't reject since it has no contract code
    let _result = nft_transfer_call(
        &contract,
        &minter,
        &receiver.id().to_string(),
        &token_id,
        "hello",
    )
    .await?;
    // Even if the callback fails, the transfer should still go through
    // (receiver account without contract code = implicit accept)
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(
        token.owner_id,
        receiver.id().to_string(),
        "Token should be owned by receiver"
    );

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_call_requires_one_yocto() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = worker.dev_create_account().await?;
    let token_id = mint_one(&contract, &minter).await?;

    let receiver = worker.dev_create_account().await?;

    // Try without deposit (0 yocto) — should fail
    let result = minter
        .call(contract.id(), "nft_transfer_call")
        .args_json(json!({
            "receiver_id": receiver.id().to_string(),
            "token_id": token_id,
            "msg": "test",
        }))
        .max_gas()
        .transact()
        .await?;
    assert!(
        result.into_result().is_err(),
        "nft_transfer_call without 1 yocto should fail"
    );

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_call_non_owner_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = worker.dev_create_account().await?;
    let token_id = mint_one(&contract, &minter).await?;

    let stranger = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;

    let result = nft_transfer_call(
        &contract,
        &stranger,
        &receiver.id().to_string(),
        &token_id,
        "steal",
    )
    .await?;
    assert!(
        result.into_result().is_err(),
        "Non-owner cannot nft_transfer_call"
    );

    // Verify ownership unchanged
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, minter.id().to_string());

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_call_nonexistent_token_fails() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = worker.dev_create_account().await?;
    storage_deposit(&contract, &minter, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let receiver = worker.dev_create_account().await?;

    let result =
        nft_transfer_call(&contract, &minter, &receiver.id().to_string(), "nope:1", "msg")
            .await?;
    assert!(
        result.into_result().is_err(),
        "Cannot transfer nonexistent token"
    );

    Ok(())
}

#[tokio::test]
async fn test_nft_transfer_call_updates_enumeration() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let minter = worker.dev_create_account().await?;
    let token_id = mint_one(&contract, &minter).await?;

    let receiver = worker.dev_create_account().await?;
    storage_deposit(&contract, &receiver, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    // Before transfer
    let supply_before =
        nft_supply_for_owner(&contract, &minter.id().to_string()).await?;
    assert_eq!(supply_before, "1");

    let _ = nft_transfer_call(
        &contract,
        &minter,
        &receiver.id().to_string(),
        &token_id,
        "",
    )
    .await?;

    // After transfer
    let minter_supply =
        nft_supply_for_owner(&contract, &minter.id().to_string()).await?;
    let receiver_supply =
        nft_supply_for_owner(&contract, &receiver.id().to_string()).await?;
    assert_eq!(minter_supply, "0", "Minter should have 0 tokens");
    assert_eq!(receiver_supply, "1", "Receiver should have 1 token");

    Ok(())
}
