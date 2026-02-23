// =============================================================================
// Scarces Integration Tests — NEP-178 Approvals
// =============================================================================
// Tests for ApproveScarce, RevokeScarce, RevokeAllScarce actions and the
// nft_is_approved / nft_approve / nft_revoke / nft_revoke_all NEP-178 views.
//
// Run: make test-integration-contract-scarces-onsocial TEST=scarces::test_approvals

use anyhow::Result;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Helper
// =============================================================================

async fn setup_user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

async fn mint_token(
    contract: &near_workspaces::Contract,
    user: &near_workspaces::Account,
    title: &str,
) -> Result<String> {
    quick_mint(contract, user, title, DEPOSIT_STORAGE)
        .await?
        .into_result()?;
    let tokens = nft_tokens_for_owner(contract, &user.id().to_string(), None, Some(10)).await?;
    Ok(tokens.last().unwrap().token_id.clone())
}

async fn nft_is_approved(
    contract: &near_workspaces::Contract,
    token_id: &str,
    account_id: &str,
    approval_id: Option<u64>,
) -> Result<bool> {
    let mut args = json!({
        "token_id": token_id,
        "approved_account_id": account_id,
    });
    if let Some(id) = approval_id {
        args["approval_id"] = json!(id);
    }
    let result = contract.view("nft_is_approved").args_json(args).await?;
    let approved: bool = serde_json::from_slice(&result.result)?;
    Ok(approved)
}

// =============================================================================
// ApproveScarce — via execute action
// =============================================================================

#[tokio::test]
async fn test_approve_scarce_happy() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Approvable").await?;

    // Approve Bob
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(result.is_success(), "approve_scarce should succeed: {:?}", result.failures());

    // Verify via nft_is_approved
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    // Verify via nft_token approved_account_ids
    let token = nft_token(&contract, &token_id).await?.unwrap();
    let approvals = token.approved_account_ids.unwrap_or_default();
    assert!(approvals.contains_key(&bob.id().to_string()));

    Ok(())
}

#[tokio::test]
async fn test_approve_scarce_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Not Bob's").await?;

    // Bob tries to approve himself on Alice's token
    let result = execute_action(
        &contract,
        &bob,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(result.is_failure(), "non-owner approve should fail");

    // Not approved
    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

#[tokio::test]
async fn test_approve_scarce_token_not_found_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": "s:nonexistent",
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(result.is_failure(), "approve on nonexistent token should fail");

    Ok(())
}

#[tokio::test]
async fn test_approve_scarce_soulbound_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    // Mint a soulbound (non-transferable) token
    let result = quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "Soulbound" }),
        None,
        None,
        false, // non-transferable
        true,
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(result.is_success(), "soulbound mint should succeed");

    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Approve should fail on soulbound token
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?;
    assert!(result.is_failure(), "approve on soulbound token should fail");

    Ok(())
}

#[tokio::test]
async fn test_approve_multiple_accounts() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;
    let carol = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Multi-Approve").await?;

    // Approve Bob
    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Approve Carol
    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": carol.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Both approved
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);
    assert!(nft_is_approved(&contract, &token_id, &carol.id().to_string(), None).await?);

    let token = nft_token(&contract, &token_id).await?.unwrap();
    let approvals = token.approved_account_ids.unwrap_or_default();
    assert_eq!(approvals.len(), 2);

    Ok(())
}

// =============================================================================
// nft_approve — direct NEP-178 call
// =============================================================================

#[tokio::test]
async fn test_nft_approve_direct() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Direct Approve").await?;

    // Call nft_approve directly (NEP-178 standard method)
    alice
        .call(contract.id(), "nft_approve")
        .args_json(json!({
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

// =============================================================================
// nft_is_approved — with approval_id
// =============================================================================

#[tokio::test]
async fn test_nft_is_approved_with_approval_id() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Approval ID").await?;

    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Get the approval_id from nft_token
    let token = nft_token(&contract, &token_id).await?.unwrap();
    let approvals = token.approved_account_ids.unwrap();
    let approval_id = approvals[&bob.id().to_string()];

    // Correct approval_id → true
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), Some(approval_id)).await?);

    // Wrong approval_id → false
    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), Some(approval_id + 999)).await?);

    // Non-approved account → false
    assert!(!nft_is_approved(&contract, &token_id, &alice.id().to_string(), None).await?);

    Ok(())
}

// =============================================================================
// RevokeScarce — via execute action
// =============================================================================

#[tokio::test]
async fn test_revoke_scarce_happy() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Revoke Me").await?;

    // Approve then revoke
    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "revoke_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success(), "revoke_scarce should succeed: {:?}", result.failures());

    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

#[tokio::test]
async fn test_revoke_scarce_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Not Revokable By Bob").await?;

    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Bob tries to revoke his own approval (only owner can)
    let result = execute_action(
        &contract,
        &bob,
        json!({
            "type": "revoke_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "non-owner revoke should fail");

    // Still approved
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

#[tokio::test]
async fn test_revoke_scarce_token_not_found_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "revoke_scarce",
            "token_id": "s:nonexistent",
            "account_id": bob.id().to_string(),
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "revoke on nonexistent token should fail");

    Ok(())
}

// =============================================================================
// nft_revoke — direct NEP-178 call
// =============================================================================

#[tokio::test]
async fn test_nft_revoke_direct() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Direct Revoke").await?;

    alice
        .call(contract.id(), "nft_approve")
        .args_json(json!({
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }))
        .deposit(DEPOSIT_STORAGE)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Revoke via nft_revoke
    alice
        .call(contract.id(), "nft_revoke")
        .args_json(json!({
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

// =============================================================================
// RevokeAllScarce — via execute action
// =============================================================================

#[tokio::test]
async fn test_revoke_all_scarce_happy() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;
    let carol = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Revoke All").await?;

    // Approve two accounts
    for account in [&bob, &carol] {
        execute_action(
            &contract,
            &alice,
            json!({
                "type": "approve_scarce",
                "token_id": &token_id,
                "account_id": account.id().to_string(),
            }),
            DEPOSIT_STORAGE,
        )
        .await?
        .into_result()?;
    }

    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);
    assert!(nft_is_approved(&contract, &token_id, &carol.id().to_string(), None).await?);

    // Revoke all
    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "revoke_all_scarce",
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_success(), "revoke_all_scarce should succeed: {:?}", result.failures());

    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);
    assert!(!nft_is_approved(&contract, &token_id, &carol.id().to_string(), None).await?);

    // Token still exists, owned by Alice
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, alice.id().to_string());
    let approvals = token.approved_account_ids.unwrap_or_default();
    assert!(approvals.is_empty());

    Ok(())
}

#[tokio::test]
async fn test_revoke_all_scarce_non_owner_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Not Revokable All").await?;

    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;

    // Bob tries revoke_all on Alice's token
    let result = execute_action(
        &contract,
        &bob,
        json!({
            "type": "revoke_all_scarce",
            "token_id": &token_id,
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "non-owner revoke_all should fail");

    // Still approved
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    Ok(())
}

#[tokio::test]
async fn test_revoke_all_scarce_token_not_found_fails() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;

    let result = execute_action(
        &contract,
        &alice,
        json!({
            "type": "revoke_all_scarce",
            "token_id": "s:nonexistent",
        }),
        ONE_YOCTO,
    )
    .await?;
    assert!(result.is_failure(), "revoke_all on nonexistent token should fail");

    Ok(())
}

// =============================================================================
// nft_revoke_all — direct NEP-178 call
// =============================================================================

#[tokio::test]
async fn test_nft_revoke_all_direct() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;
    let carol = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Direct Revoke All").await?;

    for account in [&bob, &carol] {
        alice
            .call(contract.id(), "nft_approve")
            .args_json(json!({
                "token_id": &token_id,
                "account_id": account.id().to_string(),
            }))
            .deposit(DEPOSIT_STORAGE)
            .max_gas()
            .transact()
            .await?
            .into_result()?;
    }

    // nft_revoke_all
    alice
        .call(contract.id(), "nft_revoke_all")
        .args_json(json!({ "token_id": &token_id }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    assert!(!nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);
    assert!(!nft_is_approved(&contract, &token_id, &carol.id().to_string(), None).await?);

    Ok(())
}

// =============================================================================
// Approval clears on transfer
// =============================================================================

#[tokio::test]
async fn test_approval_cleared_on_transfer() -> Result<()> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    let alice = setup_user_with_storage(&worker, &contract).await?;
    let bob = setup_user_with_storage(&worker, &contract).await?;

    let token_id = mint_token(&contract, &alice, "Transfer Clears Approval").await?;

    // Approve Bob
    execute_action(
        &contract,
        &alice,
        json!({
            "type": "approve_scarce",
            "token_id": &token_id,
            "account_id": bob.id().to_string(),
        }),
        DEPOSIT_STORAGE,
    )
    .await?
    .into_result()?;
    assert!(nft_is_approved(&contract, &token_id, &bob.id().to_string(), None).await?);

    // Transfer to Bob
    alice
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": bob.id().to_string(),
            "token_id": &token_id,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;

    // Approval should be cleared after transfer
    let token = nft_token(&contract, &token_id).await?.unwrap();
    assert_eq!(token.owner_id, bob.id().to_string());
    let approvals = token.approved_account_ids.unwrap_or_default();
    assert!(approvals.is_empty(), "approvals should be cleared after transfer");

    Ok(())
}
