use anyhow::Result;
use near_workspaces::{sandbox, Contract};
use std::fs;
use std::env;

pub async fn setup_sandbox() -> Result<near_workspaces::Worker<near_workspaces::network::Sandbox>> {
    sandbox().await.map_err(|e| anyhow::anyhow!("Failed to set up sandbox: {}", e))
}

pub async fn deploy_contract(worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>, wasm_path: &str) -> Result<Contract> {
    let wasm = fs::read(wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;
    Ok(contract)
}

pub fn get_wasm_path(contract_name: &str) -> String {
    env::var(format!("{}_WASM_PATH", contract_name.to_uppercase())).unwrap_or_else(|_| {
        format!(
            "/code/target/wasm32-unknown-unknown/release/{}.wasm",
            contract_name.replace("-", "_")
        )
    })
}