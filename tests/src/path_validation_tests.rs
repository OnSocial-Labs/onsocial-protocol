// =============================================================================
// Path Validation Integration Tests
// =============================================================================
// Tests for validation/path.rs - covers is_safe_path and validate_and_normalize_path

use anyhow::Result;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::json;

use crate::utils::{deploy_contract, get_wasm_path, setup_sandbox};

/// Deploy and initialize core-onsocial contract
async fn setup_contract(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<Contract> {
    let contract = deploy_contract(worker, &get_wasm_path("core_onsocial")).await?;

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;

    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

/// Helper to attempt a set operation with a given path
async fn try_set_path(
    account: &Account,
    contract: &Contract,
    path: &str,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let mut data = serde_json::Map::new();
    data.insert(path.to_string(), json!("test_value"));

    account
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": data }
            }
        }))
        .deposit(NearToken::from_millinear(10))
        .gas(Gas::from_tgas(50))
        .transact()
        .await
        .map_err(|e| anyhow::anyhow!(e))
}

// =============================================================================
// Single-Dot Segment Rejection Tests (Issue #1 Fix)
// =============================================================================

#[tokio::test]
async fn test_path_single_dot_leading_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "./profile" - leading single-dot segment
    let result = try_set_path(&alice, &contract, "./profile").await?;

    assert!(
        result.is_failure(),
        "Path './profile' with leading single-dot MUST be rejected"
    );

    let failure_str = format!("{:?}", result.failures());
    assert!(
        failure_str.contains("Invalid path format") || failure_str.contains("InvalidInput"),
        "Error should indicate invalid path format, got: {}",
        failure_str
    );

    println!("✅ Leading single-dot path './profile' correctly rejected");
    Ok(())
}

#[tokio::test]
async fn test_path_single_dot_embedded_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "profile/./data" - embedded single-dot segment
    let result = try_set_path(&alice, &contract, "profile/./data").await?;

    assert!(
        result.is_failure(),
        "Path 'profile/./data' with embedded single-dot MUST be rejected"
    );

    let failure_str = format!("{:?}", result.failures());
    assert!(
        failure_str.contains("Invalid path format") || failure_str.contains("InvalidInput"),
        "Error should indicate invalid path format, got: {}",
        failure_str
    );

    println!("✅ Embedded single-dot path 'profile/./data' correctly rejected");
    Ok(())
}

#[tokio::test]
async fn test_path_single_dot_trailing_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "profile/." - trailing single-dot segment
    let result = try_set_path(&alice, &contract, "profile/.").await?;

    assert!(
        result.is_failure(),
        "Path 'profile/.' with trailing single-dot MUST be rejected"
    );

    let failure_str = format!("{:?}", result.failures());
    assert!(
        failure_str.contains("Invalid path format") || failure_str.contains("InvalidInput"),
        "Error should indicate invalid path format, got: {}",
        failure_str
    );

    println!("✅ Trailing single-dot path 'profile/.' correctly rejected");
    Ok(())
}

#[tokio::test]
async fn test_path_bare_dot_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "./x" - bare single-dot as first segment with valid continuation
    // Note: "." alone is rejected by protocol layer (no slash), so we test "./x"
    let result = try_set_path(&alice, &contract, "./x").await?;

    assert!(
        result.is_failure(),
        "Path './x' (dot segment) MUST be rejected"
    );

    let failure_str = format!("{:?}", result.failures());
    assert!(
        failure_str.contains("Invalid path format") || failure_str.contains("InvalidInput"),
        "Error should indicate invalid path format, got: {}",
        failure_str
    );

    println!("✅ Dot segment path './x' correctly rejected");
    Ok(())
}

// =============================================================================
// Additional Path Format Validation Tests
// =============================================================================

#[tokio::test]
async fn test_path_consecutive_slashes_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "profile//data" - consecutive slashes
    let result = try_set_path(&alice, &contract, "profile//data").await?;

    assert!(
        result.is_failure(),
        "Path 'profile//data' with consecutive slashes MUST be rejected"
    );

    println!("✅ Consecutive slashes path 'profile//data' correctly rejected");
    Ok(())
}

#[tokio::test]
async fn test_path_backslash_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "profile\data" - backslash
    let result = try_set_path(&alice, &contract, r"profile\data").await?;

    assert!(
        result.is_failure(),
        r"Path 'profile\data' with backslash MUST be rejected"
    );

    println!(r"✅ Backslash path 'profile\data' correctly rejected");
    Ok(())
}

#[tokio::test]
async fn test_path_leading_slash_rejected() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Test: "/profile" - leading slash
    let result = try_set_path(&alice, &contract, "/profile").await?;

    assert!(
        result.is_failure(),
        "Path '/profile' with leading slash MUST be rejected"
    );

    println!("✅ Leading slash path '/profile' correctly rejected");
    Ok(())
}

// =============================================================================
// Valid Path Acceptance Tests (Sanity Check)
// =============================================================================

#[tokio::test]
async fn test_valid_paths_accepted() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = setup_contract(&worker).await?;
    let alice = worker.dev_create_account().await?;

    // Valid paths that should be accepted
    // Note: Protocol requires paths to contain '/' for DataPath classification
    let valid_paths = [
        "profile/name",
        "data/nested/deep",
        "files/doc.json",
        "my-data/test",
        "data_v2/config",
        "profile/bio/",  // trailing slash allowed
    ];

    for path in valid_paths {
        let result = try_set_path(&alice, &contract, path).await?;
        assert!(
            result.is_success(),
            "Valid path '{}' should be accepted, but got failure: {:?}",
            path,
            result.failures()
        );
        println!("   ✓ Valid path '{}' accepted", path);
    }

    println!("✅ All valid paths correctly accepted");
    Ok(())
}
