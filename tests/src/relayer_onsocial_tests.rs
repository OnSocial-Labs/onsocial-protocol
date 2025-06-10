#[allow(unused_imports)]
use crate::utils::{deploy_contract, get_wasm_path, setup_sandbox};
#[allow(unused_imports)]
use anyhow::Result;
#[allow(unused_imports)]
use near_workspaces::types::{AccountId, KeyType, SecretKey};
#[allow(unused_imports)]
use serde_json::json;

#[tokio::test]
async fn test_relayer_onsocial_init() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("relayer-onsocial");
    println!("WASM path: {}", wasm_path); // Print the WASM path for debugging
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let outcome = contract
        .call("new")
        .args_json(json!({
            "manager": "test.near",
            "platform_public_key": vec![0u8; 32], // 32-byte placeholder
            "offload_recipient": "recipient.near",
            "offload_threshold": "10000000000000000000000000" // 10 NEAR in yocto
        }))
        .transact()
        .await?;
    println!("relayer-onsocial new outcome: {:#?}", outcome);

    Ok(())
}

#[tokio::test]
async fn test_relayer_onsocial_get_paused() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("relayer-onsocial");
    println!("WASM path: {}", wasm_path);
    let contract = deploy_contract(&worker, &wasm_path).await?;

    // Initialize the contract
    let outcome = contract
        .call("new")
        .args_json(json!({
            "manager": "test.near",
            "platform_public_key": vec![0u8; 32], // 32-byte placeholder
            "offload_recipient": "recipient.near",
            "offload_threshold": "10000000000000000000000000" // 10 NEAR in yocto
        }))
        .transact()
        .await?;
    println!("relayer-onsocial new outcome: {:#?}", outcome);

    // Call get_paused and verify it returns false
    let paused: bool = contract
        .call("get_paused")
        .view()
        .await?
        .json()?;
    println!("Paused status: {}", paused);
    assert_eq!(paused, false, "Contract should not be paused after initialization");

    Ok(())
}

#[tokio::test]
async fn test_relayer_onsocial_pause_unpause() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("relayer-onsocial");
    println!("WASM path: {}", wasm_path);
    let contract = deploy_contract(&worker, &wasm_path).await?;

    // Initialize the contract
    let _ = contract
        .call("new")
        .args_json(json!({
            "manager": "test.near",
            "platform_public_key": vec![0u8; 32],
            "offload_recipient": "recipient.near",
            "offload_threshold": "10000000000000000000000000"
        }))
        .transact()
        .await?;

    // Use the root account to call pause/unpause as the manager
    let manager = worker.root_account()?;


    // Pause the contract as manager
    let pause_outcome = manager
        .call(contract.id(), "pause")
        .args_json(json!({}))
        .transact()
        .await?;
    println!("Pause outcome: {:#?}", pause_outcome);

    // Check paused status is true
    let paused: bool = contract
        .call("get_paused")
        .view()
        .await?
        .json()?;
    println!("Paused status after pause: {}", paused);
    assert_eq!(paused, true, "Contract should be paused after calling pause");

    // Unpause the contract as manager
    let unpause_outcome = manager
        .call(contract.id(), "unpause")
        .args_json(json!({}))
        .transact()
        .await?;
    println!("Unpause outcome: {:#?}", unpause_outcome);

    // Check paused status is false
    let paused: bool = contract
        .call("get_paused")
        .view()
        .await?
        .json()?;
    println!("Paused status after unpause: {}", paused);
    assert_eq!(paused, false, "Contract should not be paused after calling unpause");

    Ok(())
}