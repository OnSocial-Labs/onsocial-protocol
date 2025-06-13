use anyhow::Result;
use near_workspaces::{sandbox, Contract};
use std::env;
use std::fs;
use serde::Serializer;
use near_workspaces::types::PublicKey;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use bs58;

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

pub fn public_key_base58_serialize<S>(key: &PublicKey, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let s = bs58::encode(key.key_data()).into_string();
    serializer.serialize_str(&s)
}

pub fn encode_base64(bytes: &[u8]) -> String {
    BASE64_ENGINE.encode(bytes)
}

pub fn bytes_base64_serialize<S>(bytes: &Vec<u8>, serializer: S) -> Result<S::Ok, S::Error>
where
    S: Serializer,
{
    let s = encode_base64(bytes);
    serializer.serialize_str(&s)
}
