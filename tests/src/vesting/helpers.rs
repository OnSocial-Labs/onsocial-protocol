// =============================================================================
// Vesting Integration Test Helpers
// =============================================================================
// Shared deploy, funding, and view helpers for vesting integration tests.

use anyhow::Result;
use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::utils::get_wasm_path;

pub use crate::utils::setup_sandbox as create_sandbox;

pub const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
pub const ONE_SOCIAL: u128 = 1_000_000_000_000_000_000;
pub const TOTAL_SUPPLY: u128 = 1_000_000 * ONE_SOCIAL;
pub const VESTING_TOTAL: u128 = 100 * ONE_SOCIAL;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VestingConfigView {
    pub owner_id: String,
    pub token_id: String,
    pub beneficiary_id: String,
    pub total_amount: String,
    pub claimed_amount: String,
    pub start_at_ns: u64,
    pub cliff_at_ns: u64,
    pub end_at_ns: u64,
    pub funded: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VestingStatusView {
    pub total_amount: String,
    pub claimed_amount: String,
    pub vested_amount: String,
    pub claimable_amount: String,
    pub unvested_amount: String,
    pub funded: bool,
    pub now_ns: u64,
}

pub async fn now_nanos(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> Result<u64> {
    Ok(worker.view_block().await?.timestamp())
}

pub async fn deploy_mock_ft(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("mock-ft");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "total_supply": TOTAL_SUPPLY.to_string(),
            "decimals": 18,
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

pub async fn deploy_vesting(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
    token: &Contract,
    beneficiary: &Account,
    start_at_ns: u64,
    cliff_at_ns: u64,
    end_at_ns: u64,
) -> Result<Contract> {
    let wasm_path = get_wasm_path("vesting-onsocial");
    let wasm = std::fs::read(&wasm_path)?;
    let contract = worker.dev_deploy(&wasm).await?;

    owner
        .call(contract.id(), "new")
        .args_json(json!({
            "owner_id": owner.id().to_string(),
            "token_id": token.id().to_string(),
            "beneficiary_id": beneficiary.id().to_string(),
            "total_amount": VESTING_TOTAL.to_string(),
            "start_at_ns": start_at_ns,
            "cliff_at_ns": cliff_at_ns,
            "end_at_ns": end_at_ns,
        }))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

pub async fn ft_register(
    ft: &Contract,
    caller: &Account,
    account_id: &near_workspaces::AccountId,
) -> Result<()> {
    caller
        .call(ft.id(), "storage_deposit")
        .args_json(json!({ "account_id": account_id.to_string() }))
        .deposit(NearToken::from_millinear(50))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

pub async fn mint_ft(
    ft: &Contract,
    caller: &Account,
    account_id: &near_workspaces::AccountId,
    amount: u128,
) -> Result<()> {
    caller
        .call(ft.id(), "mint")
        .args_json(json!({
            "account_id": account_id.to_string(),
            "amount": amount.to_string(),
        }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

pub async fn set_fail_next_transfer(
    ft: &Contract,
    caller: &Account,
    should_fail: bool,
) -> Result<()> {
    caller
        .call(ft.id(), "set_fail_next_transfer")
        .args_json(json!({ "should_fail": should_fail }))
        .transact()
        .await?
        .into_result()?;
    Ok(())
}

pub async fn fund_vesting(
    ft: &Contract,
    owner: &Account,
    vesting: &Contract,
    amount: u128,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    let result = owner
        .call(ft.id(), "ft_transfer_call")
        .args_json(json!({
            "receiver_id": vesting.id().to_string(),
            "amount": amount.to_string(),
            "msg": "",
        }))
        .deposit(ONE_YOCTO)
        .max_gas()
        .transact()
        .await?;

    Ok(result)
}

pub async fn claim_vesting(
    vesting: &Contract,
    beneficiary: &Account,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(beneficiary
        .call(vesting.id(), "claim")
        .max_gas()
        .transact()
        .await?)
}

pub async fn set_beneficiary(
    vesting: &Contract,
    owner: &Account,
    beneficiary: &Account,
) -> Result<near_workspaces::result::ExecutionFinalResult> {
    Ok(owner
        .call(vesting.id(), "set_beneficiary")
        .args_json(json!({
            "new_beneficiary": beneficiary.id().to_string(),
        }))
        .transact()
        .await?)
}

pub async fn ft_balance_of(ft: &Contract, account_id: &str) -> Result<u128> {
    let res: Value = ft
        .view("ft_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json()?;
    Ok(res.as_str().unwrap().parse()?)
}

pub async fn storage_balance_of(ft: &Contract, account_id: &str) -> Result<Option<Value>> {
    Ok(ft
        .view("storage_balance_of")
        .args_json(json!({ "account_id": account_id }))
        .await?
        .json::<Option<Value>>()?)
}

pub async fn get_config(vesting: &Contract) -> Result<VestingConfigView> {
    Ok(vesting.view("get_config").await?.json()?)
}

pub async fn get_status(vesting: &Contract) -> Result<VestingStatusView> {
    Ok(vesting.view("get_status").await?.json()?)
}