// =============================================================================
// App Relations Integration Tests
// =============================================================================
// E2E coverage for app_creators / app_owners tracking sets exposed via the
// is_app_creator / is_app_owner / get_app_*_count / get_app_creators /
// get_app_owners views. Exercises real collection lifecycle plus token
// mint, transfer, and burn flows in sandbox.
//
// Run: make test-integration-contract-scarces-onsocial TEST=scarces::test_app_relations

use anyhow::Result;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

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

async fn user(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

async fn get_app_creator_count(contract: &near_workspaces::Contract, app_id: &str) -> Result<u32> {
    let res = contract
        .view("get_app_creator_count")
        .args_json(json!({ "app_id": app_id }))
        .await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn get_app_owner_count(contract: &near_workspaces::Contract, app_id: &str) -> Result<u32> {
    let res = contract
        .view("get_app_owner_count")
        .args_json(json!({ "app_id": app_id }))
        .await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn is_app_creator(
    contract: &near_workspaces::Contract,
    app_id: &str,
    account_id: &str,
) -> Result<bool> {
    let res = contract
        .view("is_app_creator")
        .args_json(json!({ "app_id": app_id, "account_id": account_id }))
        .await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn is_app_owner(
    contract: &near_workspaces::Contract,
    app_id: &str,
    account_id: &str,
) -> Result<bool> {
    let res = contract
        .view("is_app_owner")
        .args_json(json!({ "app_id": app_id, "account_id": account_id }))
        .await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn get_app_creators(
    contract: &near_workspaces::Contract,
    app_id: &str,
    from_index: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<String>> {
    let mut args = json!({ "app_id": app_id });
    if let Some(i) = from_index {
        args["from_index"] = json!(i);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let res = contract.view("get_app_creators").args_json(args).await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn get_app_owners(
    contract: &near_workspaces::Contract,
    app_id: &str,
    from_index: Option<u32>,
    limit: Option<u32>,
) -> Result<Vec<String>> {
    let mut args = json!({ "app_id": app_id });
    if let Some(i) = from_index {
        args["from_index"] = json!(i);
    }
    if let Some(l) = limit {
        args["limit"] = json!(l);
    }
    let res = contract.view("get_app_owners").args_json(args).await?;
    Ok(serde_json::from_slice(&res.result)?)
}

async fn delete_collection(
    contract: &near_workspaces::Contract,
    creator: &near_workspaces::Account,
    collection_id: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    execute_action(
        contract,
        creator,
        json!({
            "type": "delete_collection",
            "collection_id": collection_id,
        }),
        ONE_YOCTO,
    )
    .await
}

fn template() -> serde_json::Value {
    json!({ "title": "T" })
}

// =============================================================================
// Creator tracking
// =============================================================================

#[tokio::test]
async fn test_app_creator_tracked_on_collection_create() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    assert_eq!(get_app_creator_count(&contract, &app_id).await?, 0);

    let creator = user(&worker, &contract).await?;
    create_collection_for_app(
        &contract,
        &creator,
        "c1",
        10,
        "0",
        template(),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    assert!(is_app_creator(&contract, &app_id, &creator.id().to_string()).await?);
    assert_eq!(get_app_creator_count(&contract, &app_id).await?, 1);
    Ok(())
}

#[tokio::test]
async fn test_app_creator_refcount_across_collections() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let creator = user(&worker, &contract).await?;

    create_collection_for_app(
        &contract,
        &creator,
        "c1",
        5,
        "0",
        template(),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    create_collection_for_app(
        &contract,
        &creator,
        "c2",
        5,
        "0",
        template(),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    assert_eq!(get_app_creator_count(&contract, &app_id).await?, 1);

    delete_collection(&contract, &creator, "c1")
        .await?
        .into_result()?;
    assert!(is_app_creator(&contract, &app_id, &creator.id().to_string()).await?);

    delete_collection(&contract, &creator, "c2")
        .await?
        .into_result()?;
    assert!(!is_app_creator(&contract, &app_id, &creator.id().to_string()).await?);
    assert_eq!(get_app_creator_count(&contract, &app_id).await?, 0);
    Ok(())
}

#[tokio::test]
async fn test_app_creators_paginated() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let alice = user(&worker, &contract).await?;
    let bob = user(&worker, &contract).await?;
    create_collection_for_app(
        &contract,
        &alice,
        "ca",
        5,
        "0",
        template(),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    create_collection_for_app(
        &contract,
        &bob,
        "cb",
        5,
        "0",
        template(),
        &app_id,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let all = get_app_creators(&contract, &app_id, None, None).await?;
    assert_eq!(all.len(), 2);
    let page = get_app_creators(&contract, &app_id, Some(1), Some(1)).await?;
    assert_eq!(page.len(), 1);
    Ok(())
}

// =============================================================================
// Owner tracking
// =============================================================================

#[tokio::test]
async fn test_app_owner_tracked_on_quick_mint_and_burn() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let alice = user(&worker, &contract).await?;
    quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "A" }),
        None,
        Some(&app_id),
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    assert!(is_app_owner(&contract, &app_id, &alice.id().to_string()).await?);
    assert_eq!(get_app_owner_count(&contract, &app_id).await?, 1);

    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(1)).await?;
    let token_id = tokens[0].token_id.clone();
    burn_scarce(&contract, &alice, &token_id, None, ONE_YOCTO)
        .await?
        .into_result()?;

    assert!(!is_app_owner(&contract, &app_id, &alice.id().to_string()).await?);
    assert_eq!(get_app_owner_count(&contract, &app_id).await?, 0);
    Ok(())
}

#[tokio::test]
async fn test_app_owner_reindexed_on_transfer() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let alice = user(&worker, &contract).await?;
    let bob = user(&worker, &contract).await?;

    quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "A" }),
        None,
        Some(&app_id),
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "B" }),
        None,
        Some(&app_id),
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    assert_eq!(get_app_owner_count(&contract, &app_id).await?, 1);

    let tokens = nft_tokens_for_owner(&contract, &alice.id().to_string(), None, Some(2)).await?;
    let t0 = tokens[0].token_id.clone();
    let t1 = tokens[1].token_id.clone();

    // First transfer: both Alice and Bob hold tokens — count = 2.
    alice
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": bob.id().to_string(),
            "token_id": &t0,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(get_app_owner_count(&contract, &app_id).await?, 2);
    assert!(is_app_owner(&contract, &app_id, &alice.id().to_string()).await?);
    assert!(is_app_owner(&contract, &app_id, &bob.id().to_string()).await?);

    // Transfer second token: Alice drops out, Bob remains.
    alice
        .call(contract.id(), "nft_transfer")
        .args_json(json!({
            "receiver_id": bob.id().to_string(),
            "token_id": &t1,
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?
        .into_result()?;
    assert_eq!(get_app_owner_count(&contract, &app_id).await?, 1);
    assert!(!is_app_owner(&contract, &app_id, &alice.id().to_string()).await?);
    assert!(is_app_owner(&contract, &app_id, &bob.id().to_string()).await?);
    Ok(())
}

#[tokio::test]
async fn test_app_owners_paginated() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let app_owner = user(&worker, &contract).await?;
    let app_id = app_owner.id().to_string();
    register_app(&contract, &app_owner, &app_id, DEPOSIT_LARGE)
        .await?
        .into_result()?;

    let alice = user(&worker, &contract).await?;
    let bob = user(&worker, &contract).await?;
    quick_mint_full(
        &contract,
        &alice,
        json!({ "title": "A" }),
        None,
        Some(&app_id),
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;
    quick_mint_full(
        &contract,
        &bob,
        json!({ "title": "B" }),
        None,
        Some(&app_id),
        true,
        true,
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    let all = get_app_owners(&contract, &app_id, None, None).await?;
    assert_eq!(all.len(), 2);
    let page = get_app_owners(&contract, &app_id, Some(0), Some(1)).await?;
    assert_eq!(page.len(), 1);
    Ok(())
}

// =============================================================================
// Empty / unknown app
// =============================================================================

#[tokio::test]
async fn test_unknown_app_returns_empty() -> Result<()> {
    let (_worker, _owner, contract) = setup().await?;
    let bogus = "no-such-app.testnet";
    assert_eq!(get_app_creator_count(&contract, bogus).await?, 0);
    assert_eq!(get_app_owner_count(&contract, bogus).await?, 0);
    assert!(get_app_creators(&contract, bogus, None, None).await?.is_empty());
    assert!(get_app_owners(&contract, bogus, None, None).await?.is_empty());
    assert!(!is_app_creator(&contract, bogus, "alice.testnet").await?);
    assert!(!is_app_owner(&contract, bogus, "alice.testnet").await?);
    Ok(())
}
