use anyhow::Result;
use near_workspaces::types::{NearToken, NearGas};
use near_workspaces::{sandbox, AccountId, Contract};
use serde_json::json;
use std::fs;

const AUTH_WASM_FILEPATH: &str = "../contracts/auth-onsocial/target/wasm32-unknown-unknown/release/auth_onsocial.wasm";

#[tokio::test]
async fn test_auth_onsocial_contract() -> Result<()> {
    let worker = sandbox().await?;
    let wasm = fs::read(AUTH_WASM_FILEPATH)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let outcome = contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?;
    println!("new outcome: {:#?}", outcome);
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