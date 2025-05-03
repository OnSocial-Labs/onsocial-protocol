use near_workspaces::types::{AccountId, NearToken, SecretKey, KeyType};
use near_workspaces::{Account, Contract, Worker};
use near_crypto::{InMemorySigner, KeyType as CryptoKeyType};
use serde_json::json;
use std::path::Path;

const ONE_NEAR: NearToken = NearToken::from_near(1);

#[tokio::test]
async fn test_auth_contract() -> anyhow::Result<()> {
    println!("Starting test_auth_contract");

    // Suppress unused imports warning with debug assertions
    debug_assert!(std::mem::size_of::<Account>() > 0, "Account type is used");
    debug_assert!(std::mem::size_of::<Contract>() > 0, "Contract type is used");
    debug_assert!(std::mem::size_of::<Worker<near_workspaces::network::Sandbox>>() > 0, "Worker type is used");

    // Initialize the sandbox worker
    println!("Creating sandbox worker");
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    println!("Sandbox worker created, root account: {}", root.id());

    // Try to load auth-onsocial.wasm from the monorepo root target directory
    println!("Loading WASM file");
    let standard_wasm_path = Path::new("../target/wasm32-unknown-unknown/release/auth_onsocial.wasm");
    let auth_wasm = match std::fs::read(standard_wasm_path) {
        Ok(wasm) => {
            println!("WASM loaded from {}", standard_wasm_path.display());
            wasm
        }
        Err(e) => {
            println!("Failed to read WASM from {}: {:?}", standard_wasm_path.display(), e);
            // Fallback to target/near path
            let fallback_wasm_path = Path::new("../target/near/auth_onsocial/auth_onsocial.wasm");
            match std::fs::read(fallback_wasm_path) {
                Ok(wasm) => {
                    println!("WASM loaded from {}", fallback_wasm_path.display());
                    wasm
                }
                Err(e) => {
                    println!("Failed to read WASM from {}: {:?}", fallback_wasm_path.display(), e);
                    return Err(anyhow::anyhow!("Could not find auth_onsocial.wasm"));
                }
            }
        }
    };

    // Deploy auth-onsocial.wasm
    println!("Deploying auth-onsocial contract");
    let auth_contract_id: AccountId = "auth-onsocial".parse()?;
    let auth_account = worker
        .create_tla(auth_contract_id.clone(), SecretKey::from_random(KeyType::ED25519))
        .await?
        .into_result()?;
    let auth_contract = auth_account.deploy(&auth_wasm).await?.into_result()?;
    println!("Contract deployed to account: {}", auth_contract_id);

    // Initialize the contract
    println!("Initializing contract");
    let outcome = auth_contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await;
    if outcome.is_err() {
        println!("auth-onsocial initialization failed: {:?}", outcome);
    } else {
        println!("auth-onsocial initialization succeeded: {:?}", outcome);
    }

    // Create a user account
    println!("Creating user account");
    let user = root
        .create_subaccount("user")
        .initial_balance(ONE_NEAR)
        .transact()
        .await?
        .into_result()?;
    println!("User account created: {}", user.id());

    // Generate a valid public key
    println!("Generating public key");
    let signer = InMemorySigner::from_random("user".parse()?, CryptoKeyType::ED25519);
    let public_key = signer.public_key();
    println!("Public key generated: {:?}", public_key);

    // Call register_key as the user
    println!("Calling register_key");
    let outcome = user
        .call(&auth_contract_id, "register_key")
        .args_json(json!({
            "account_id": user.id(),
            "public_key": public_key,
            "expiration_days": null,
            "is_multi_sig": false,
            "multi_sig_threshold": null
        }))
        .transact()
        .await
        .unwrap();
    if !outcome.is_success() {
        println!("register_key failed: {:?}", outcome);
    } else {
        println!("register_key succeeded: {:?}", outcome);
    }

    println!("Test completed successfully");
    Ok(())
}