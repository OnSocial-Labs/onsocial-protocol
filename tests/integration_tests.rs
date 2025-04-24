use anyhow::Result;
use near_workspaces::types::{NearToken, NearGas};
use near_workspaces::{sandbox, AccountId, Contract};
use serde_json::json;
use std::fs;
use std::env;

#[tokio::test]
async fn test_auth_onsocial_contract() -> Result<()> {
    let worker = sandbox().await?;
    let wasm_path = env::var("AUTH_WASM_PATH").unwrap_or("../contracts/auth-onsocial/target/wasm32-unknown-unknown/release/auth_onsocial.wasm");
    let wasm = fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let outcome = contract.call("new").args_json(json!({})).transact().await?;
    println!("auth-onsocial new outcome: {:#?}", outcome);
    let account_id: AccountId = "test.near".parse()?;
    let public_key = "ed25519:6E8sCci9badyRkbrr2TV5CC3oKTo7Znny8mG5k415kZU";
    let outcome = contract
        .call("register_key")
        .args_json(json!({
            "account_id": account_id,
            "public_key": public_key,
            "expiration_days": null,
            "is_multi_sig": false,
            "multi_sig_threshold": null
        }))
        .deposit(NearToken::from_yoctonear(1250000000000000000000))
        .gas(NearGas::from_tgas(50))
        .transact()
        .await?;
    println!("register_key outcome: {:#?}", outcome);
    let result: serde_json::Value = contract
        .call("get_keys")
        .args_json(json!({
            "account_id": account_id,
            "limit": 10,
            "offset": 0
        }))
        .view()
        .await?
        .json()?;
    println!("get_keys result: {}", result);
    assert!(result.as_array().unwrap().iter().any(|key| key["public_key"] == public_key));
    Ok(())
}

#[tokio::test]
async fn test_ft_wrapper_onsocial_contract() -> Result<()> {
    let worker = sandbox().await?;
    let wasm_path = env::var("FT_WASM_PATH").unwrap_or("../contracts/ft-wrapper-onsocial/target/wasm32-unknown-unknown/release/ft_wrapper_onsocial.wasm");
    let wasm = fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let outcome = contract
        .call("new")
        .args_json(json!({"manager": "test.near", "relayer_contract": "relayer.sandbox", "storage_deposit": "1250000000000000000000"}))
        .transact()
        .await?;
    println!("ft-wrapper-onsocial new outcome: {:#?}", outcome);
    Ok(())
}

#[tokio::test]
async fn test_relayer_onsocial_contract() -> Result<()> {
    let worker = sandbox().await?;
    let wasm_path = env::var("RELAYER_WASM_PATH").unwrap_or("../contracts/relayer-onsocial/target/wasm32-unknown-unknown/release/relayer_onsocial.wasm");
    let wasm = fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let outcome = contract
        .call("new")
        .args_json(json!({"offload_recipient": "test.near", "auth_contract": "auth.sandbox", "ft_wrapper_contract": "ft-wrapper.sandbox"}))
        .transact()
        .await?;
    println!("relayer-onsocial new outcome: {:#?}", outcome);
    Ok(())
}