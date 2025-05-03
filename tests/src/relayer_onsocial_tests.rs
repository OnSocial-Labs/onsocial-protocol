#[allow(unused_imports)]
use crate::utils::{deploy_contract, get_wasm_path, setup_sandbox};
#[allow(unused_imports)]
use anyhow::Result;
#[allow(unused_imports)]
use serde_json::json;

#[tokio::test]
async fn test_relayer_onsocial_init() -> Result<()> {
    let worker = setup_sandbox().await?;
    let wasm_path = get_wasm_path("relayer-onsocial");
    let contract = deploy_contract(&worker, &wasm_path).await?;

    let outcome = contract
        .call("new")
        .args_json(json!({"offload_recipient": "test.near", "auth_contract": "auth.sandbox", "ft_wrapper_contract": "ft-wrapper.sandbox"}))
        .transact()
        .await?;
    println!("relayer-onsocial new outcome: {:#?}", outcome);

    Ok(())
}
