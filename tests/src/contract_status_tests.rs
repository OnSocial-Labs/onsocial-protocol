use anyhow::Result;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::{json, Value};

use crate::utils::{get_wasm_path, setup_sandbox};

const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

async fn deploy_unactivated(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("core-onsocial");
    let wasm = std::fs::read(std::path::Path::new(&wasm_path))?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn deploy_and_activate(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<Contract> {
    let contract = deploy_unactivated(worker).await?;
    contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;
    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?)
}

fn find_contract_update_event<S: AsRef<str>>(logs: &[S]) -> Option<Value> {
    for log in logs {
        let log = log.as_ref();
        if !log.starts_with("EVENT_JSON:") {
            continue;
        }
        let json_str = &log["EVENT_JSON:".len()..];
        if let Ok(event) = serde_json::from_str::<Value>(json_str) {
            if event.get("event").and_then(|v| v.as_str()) == Some("CONTRACT_UPDATE") {
                return Some(event);
            }
        }
    }
    None
}

fn extract_event_data(event: &Value) -> Option<&Value> {
    event.get("data")?.get(0)
}

/// Extracts bool result from raw_bytes of ExecutionFinalResult (clones the result)
fn parse_bool_result(result: &near_workspaces::result::ExecutionFinalResult) -> Option<bool> {
    let raw = result.clone().raw_bytes().ok()?;
    serde_json::from_slice(&raw).ok()
}

/// Test: Full contract lifecycle state machine with event validation
///
/// Validates: Genesis → Live → ReadOnly → Live
/// Asserts correct status view and CONTRACT_UPDATE event schema at each transition
#[tokio::test]
async fn test_contract_status_full_lifecycle_with_events() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_unactivated(&worker).await?;

    // Step 1: Verify Genesis status
    let status: Value = contract.view("get_contract_status").await?.json()?;
    assert_eq!(status, "Genesis", "Fresh contract should be in Genesis");

    // Step 2: Activate (Genesis → Live)
    let activate_result = contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        activate_result.is_success(),
        "activate_contract should succeed"
    );

    let changed = parse_bool_result(&activate_result);
    assert_eq!(
        changed,
        Some(true),
        "activate_contract should return true on first call"
    );

    // Validate event schema
    let event = find_contract_update_event(&activate_result.logs())
        .expect("CONTRACT_UPDATE event should be emitted");
    let data = extract_event_data(&event).expect("Event should have data");
    assert_eq!(
        data.get("operation").and_then(|v| v.as_str()),
        Some("activate_contract")
    );
    assert_eq!(
        data.get("previous").and_then(|v| v.as_str()),
        Some("Genesis")
    );
    assert_eq!(data.get("new").and_then(|v| v.as_str()), Some("Live"));

    // Verify status updated
    let status: Value = contract.view("get_contract_status").await?.json()?;
    assert_eq!(status, "Live", "Contract should be Live after activation");

    // Step 3: Enter ReadOnly (Live → ReadOnly)
    let enter_ro = contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(enter_ro.is_success(), "enter_read_only should succeed");

    let changed = parse_bool_result(&enter_ro);
    assert_eq!(changed, Some(true), "enter_read_only should return true");

    let event = find_contract_update_event(&enter_ro.logs())
        .expect("CONTRACT_UPDATE event should be emitted");
    let data = extract_event_data(&event).expect("Event should have data");
    assert_eq!(
        data.get("operation").and_then(|v| v.as_str()),
        Some("enter_read_only")
    );
    assert_eq!(data.get("previous").and_then(|v| v.as_str()), Some("Live"));
    assert_eq!(data.get("new").and_then(|v| v.as_str()), Some("ReadOnly"));

    let status: Value = contract.view("get_contract_status").await?.json()?;
    assert_eq!(status, "ReadOnly", "Contract should be ReadOnly");

    // Step 4: Resume Live (ReadOnly → Live)
    let resume = contract
        .call("resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(resume.is_success(), "resume_live should succeed");

    let changed = parse_bool_result(&resume);
    assert_eq!(changed, Some(true), "resume_live should return true");

    let event = find_contract_update_event(&resume.logs())
        .expect("CONTRACT_UPDATE event should be emitted");
    let data = extract_event_data(&event).expect("Event should have data");
    assert_eq!(
        data.get("operation").and_then(|v| v.as_str()),
        Some("resume_live")
    );
    assert_eq!(
        data.get("previous").and_then(|v| v.as_str()),
        Some("ReadOnly")
    );
    assert_eq!(data.get("new").and_then(|v| v.as_str()), Some("Live"));

    let status: Value = contract.view("get_contract_status").await?.json()?;
    assert_eq!(status, "Live", "Contract should be Live after resume");

    Ok(())
}

/// Test: Idempotent status transitions return false with no event
///
/// Calling a transition when already in target state should return false
/// and NOT emit any CONTRACT_UPDATE event.
#[tokio::test]
async fn test_contract_status_idempotent_no_event_emission() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_and_activate(&worker).await?;

    // activate_contract on already Live contract
    let activate_again = contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(activate_again.is_success());

    let changed = parse_bool_result(&activate_again);
    assert_eq!(
        changed,
        Some(false),
        "activate_contract should return false when already Live"
    );

    let event = find_contract_update_event(&activate_again.logs());
    assert!(
        event.is_none(),
        "No CONTRACT_UPDATE event should be emitted for idempotent call"
    );

    // Enter ReadOnly
    contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?
        .into_result()?;

    // enter_read_only again (already ReadOnly)
    let enter_again = contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(enter_again.is_success());

    let changed = parse_bool_result(&enter_again);
    assert_eq!(
        changed,
        Some(false),
        "enter_read_only should return false when already ReadOnly"
    );

    let event = find_contract_update_event(&enter_again.logs());
    assert!(
        event.is_none(),
        "No CONTRACT_UPDATE event on idempotent enter_read_only"
    );

    // Resume Live
    contract
        .call("resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?
        .into_result()?;

    // resume_live again (already Live)
    let resume_again = contract
        .call("resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(resume_again.is_success());

    let changed = parse_bool_result(&resume_again);
    assert_eq!(
        changed,
        Some(false),
        "resume_live should return false when already Live"
    );

    let event = find_contract_update_event(&resume_again.logs());
    assert!(
        event.is_none(),
        "No CONTRACT_UPDATE event on idempotent resume_live"
    );

    Ok(())
}

/// Test: Invalid state transitions fail with correct errors
#[tokio::test]
async fn test_contract_status_invalid_transitions_fail() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_unactivated(&worker).await?;

    // Genesis: cannot enter_read_only
    let result = contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "enter_read_only should fail from Genesis"
    );
    let failures = format!("{:?}", result.failures());
    assert!(
        failures.contains("can only enter ReadOnly from Live"),
        "Error should indicate invalid transition: {failures}"
    );

    // Genesis: cannot resume_live
    let result = contract
        .call("resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(result.is_failure(), "resume_live should fail from Genesis");
    let failures = format!("{:?}", result.failures());
    assert!(
        failures.contains("can only resume Live from ReadOnly"),
        "Error should indicate invalid transition: {failures}"
    );

    // Activate to Live
    contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // Live: cannot activate again (idempotent, but let's verify the concept via ReadOnly)
    contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // ReadOnly: cannot activate_contract
    let result = contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "activate_contract should fail from ReadOnly"
    );
    let failures = format!("{:?}", result.failures());
    assert!(
        failures.contains("can only activate Live from Genesis"),
        "Error should indicate invalid transition: {failures}"
    );

    Ok(())
}

/// Test: Non-manager cannot perform status transitions
#[tokio::test]
async fn test_contract_status_manager_only_enforcement() -> Result<()> {
    let worker = setup_sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_activate(&worker).await?;

    let non_manager = create_user(&root, "nonmanager", TEN_NEAR).await?;

    // Non-manager tries enter_read_only
    let result = non_manager
        .call(contract.id(), "enter_read_only")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "Non-manager should not be able to enter_read_only"
    );
    let failures = format!("{:?}", result.failures());
    assert!(
        failures.contains("manager") || failures.contains("Unauthorized"),
        "Error should indicate manager-only: {failures}"
    );

    // Manager enters ReadOnly
    contract
        .call("enter_read_only")
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    // Non-manager tries resume_live
    let result = non_manager
        .call(contract.id(), "resume_live")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "Non-manager should not be able to resume_live"
    );

    Ok(())
}

/// Test: Status transitions require exactly 1 yoctoNEAR deposit
#[tokio::test]
async fn test_contract_status_requires_one_yocto_deposit() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_unactivated(&worker).await?;

    // No deposit
    let result = contract
        .call("activate_contract")
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "activate_contract should fail without deposit"
    );
    let failures = format!("{:?}", result.failures());
    assert!(
        failures.contains("1 yoctoNEAR"),
        "Error should mention 1 yoctoNEAR: {failures}"
    );

    // Too much deposit (2 yocto)
    let result = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(2))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "activate_contract should fail with >1 yocto"
    );

    // Exactly 1 yocto succeeds
    let result = contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        result.is_success(),
        "activate_contract should succeed with exactly 1 yocto"
    );

    Ok(())
}

/// Test: EVENT schema includes standard, version, partition_id, path
#[tokio::test]
async fn test_contract_status_event_schema_completeness() -> Result<()> {
    let worker = setup_sandbox().await?;
    let contract = deploy_unactivated(&worker).await?;

    let result = contract
        .call("activate_contract")
        .deposit(ONE_YOCTO)
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(result.is_success());

    let event =
        find_contract_update_event(&result.logs()).expect("CONTRACT_UPDATE event should exist");

    // NEP-297 standard fields
    assert_eq!(
        event.get("standard").and_then(|v| v.as_str()),
        Some("onsocial")
    );
    assert_eq!(
        event.get("version").and_then(|v| v.as_str()),
        Some("1.0.0")
    );
    assert_eq!(
        event.get("event").and_then(|v| v.as_str()),
        Some("CONTRACT_UPDATE")
    );

    let data = extract_event_data(&event).expect("Event data should exist");

    // Required fields
    assert!(
        data.get("operation").is_some(),
        "Event should have operation"
    );
    assert!(data.get("author").is_some(), "Event should have author");
    assert!(data.get("path").is_some(), "Event should have path");
    assert!(
        data.get("partition_id").is_some(),
        "Event should have partition_id"
    );
    assert!(
        data.get("previous").is_some(),
        "Event should have previous status"
    );
    assert!(data.get("new").is_some(), "Event should have new status");

    // Path format validation
    let path = data.get("path").and_then(|v| v.as_str()).unwrap();
    assert!(
        path.ends_with("/contract/status"),
        "Path should end with /contract/status, got: {path}"
    );

    Ok(())
}
