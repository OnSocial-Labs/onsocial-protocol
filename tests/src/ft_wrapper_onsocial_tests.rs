// tests/src/ft_wrapper_onsocial_tests.rs
use anyhow::Result;
use serde_json::json;
use crate::utils::{setup_sandbox, deploy_contract, get_wasm_path};

#[tokio::test]
async fn test_ft_wrapper_onsocial_init() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("ft-wrapper-onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let outcome = contract
        .call("new")
        .args_json(json!({"manager": "test.near", "relayer_contract": "relayer.sandbox", "storage_deposit": "1250000000000000000000"}))
        .transact()
        .await?;
    println!("ft-wrapper-onsocial new outcome: {:#?}", outcome);

    Ok(())
}