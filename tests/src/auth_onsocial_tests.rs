#[allow(unused_imports)]
use crate::utils::{deploy_contract, get_wasm_path, setup_sandbox};
#[allow(unused_imports)]
use anyhow::Result;
#[allow(unused_imports)]
use near_workspaces::types::{Gas, NearToken};
#[allow(unused_imports)]
use near_workspaces::AccountId;
#[allow(unused_imports)]
use serde_json::json;

#[tokio::test]
async fn test_auth_onsocial_register_key() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("auth-onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    // Initialize contract
    let outcome = contract.call("new").args_json(json!({})).transact().await?;
    println!("auth-onsocial new outcome: {:#?}", outcome);

    // Test register_key
    let account_id: AccountId = "test.near".parse::<AccountId>()?;
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
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    println!("register_key outcome: {:#?}", outcome);

    // Verify key registration
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
    assert!(result
        .as_array()
        .unwrap()
        .iter()
        .any(|key| key["public_key"] == public_key));

    Ok(())
}
