use anyhow::Result;
use near_workspaces::{sandbox, Contract};
use std::env;
use std::fs;

pub async fn setup_sandbox() -> Result<near_workspaces::Worker<near_workspaces::network::Sandbox>> {
    let mut last_err = None;
    for attempt in 1..=6 {
        match sandbox().await {
            Ok(worker) => return Ok(worker),
            Err(e) => {
                last_err = Some(e);
                eprintln!("[setup_sandbox] Attempt {}/6 failed, retrying in 5s: {}", attempt, last_err.as_ref().unwrap());
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
    Err(anyhow::anyhow!("Failed to set up sandbox after 6 attempts: {}", last_err.unwrap()))
}

pub async fn deploy_contract(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    wasm_path: &str,
) -> Result<Contract> {
    let wasm = fs::read(wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;
    Ok(contract)
}

pub fn get_wasm_path(contract_name: &str) -> String {
    env::var(format!("{}_WASM_PATH", contract_name.to_uppercase())).unwrap_or_else(|_| {
        format!(
            "/code/target/near/{0}/{0}.wasm",
            contract_name.replace("-", "_")
        )
    })
}
