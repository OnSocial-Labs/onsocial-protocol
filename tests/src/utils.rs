use anyhow::Result;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use bs58;
use near_workspaces::types::PublicKey;
use near_workspaces::{sandbox, Contract};
use serde::Serializer;
use serde_json::Value;
use std::env;
use std::fs;

pub async fn setup_sandbox() -> Result<near_workspaces::Worker<near_workspaces::network::Sandbox>> {
    let mut last_err = None;
    for attempt in 1..=6 {
        match sandbox().await {
            Ok(worker) => return Ok(worker),
            Err(e) => {
                last_err = Some(e);
                eprintln!(
                    "[setup_sandbox] Attempt {}/6 failed, retrying in 5s: {}",
                    attempt,
                    last_err.as_ref().unwrap()
                );
                tokio::time::sleep(std::time::Duration::from_secs(5)).await;
            }
        }
    }
    Err(anyhow::anyhow!(
        "Failed to set up sandbox after 6 attempts: {}",
        last_err.unwrap()
    ))
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

/// Helpers for the core contract `get` view method.
///
/// `get` returns an ordered `Vec<EntryView>` serialized as JSON objects like:
/// `{ requested_key, full_key, value, block_height, deleted }`.
pub fn entry_by_full_key<'a>(entries: &'a [Value], full_key: &str) -> Option<&'a Value> {
    entries
        .iter()
        .find(|e| e.get("full_key").and_then(|v| v.as_str()) == Some(full_key))
}

pub fn entry_value<'a>(entries: &'a [Value], full_key: &str) -> Option<&'a Value> {
    entry_by_full_key(entries, full_key).and_then(|e| e.get("value"))
}

pub fn entry_value_str<'a>(entries: &'a [Value], full_key: &str) -> Option<&'a str> {
    entry_value(entries, full_key).and_then(|v| v.as_str())
}

pub fn entry_exists(entries: &[Value], full_key: &str) -> bool {
    let Some(entry) = entry_by_full_key(entries, full_key) else {
        return false;
    };

    let deleted = entry.get("deleted").and_then(|v| v.as_bool()).unwrap_or(false);
    if deleted {
        return false;
    }

    entry.get("value").map(|v| !v.is_null()).unwrap_or(false)
}
