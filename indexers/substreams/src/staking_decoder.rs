//! Staking event decoder
//!
//! Decodes NEP-297 events from staking.onsocial contract logs.
//! Events: STAKE_LOCK, STAKE_EXTEND, STAKE_UNLOCK, REWARDS_RELEASED,
//!         REWARDS_CLAIM, CREDITS_PURCHASE, SCHEDULED_FUND, INFRA_WITHDRAW,
//!         OWNER_CHANGED, CONTRACT_UPGRADE, STORAGE_DEPOSIT,
//!         UNLOCK_FAILED, CLAIM_FAILED, WITHDRAW_INFRA_FAILED

use crate::pb::staking::v1::*;
use crate::pb::staking::v1::staking_event::Payload;
use serde_json::Value;

pub fn decode_staking_event(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Option<StakingEvent> {
    let parsed: Value = serde_json::from_str(json_data).ok()?;

    let standard = parsed.get("standard")?.as_str()?;
    if standard != "onsocial" {
        return None;
    }

    let event_type = parsed.get("event")?.as_str()?;
    let data_arr = parsed.get("data")?.as_array()?;
    let data = data_arr.first()?;

    let account_id = data
        .get("account_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let id = format!("{}-{}-{}", receipt_id, log_index, event_type);
    let (success, payload) = decode_payload(event_type, data)?;

    Some(StakingEvent {
        id,
        block_height,
        block_timestamp,
        receipt_id: receipt_id.to_string(),
        account_id,
        event_type: event_type.to_string(),
        success,
        payload: Some(payload),
    })
}

fn decode_payload(event_type: &str, data: &Value) -> Option<(bool, Payload)> {
    match event_type {
        "STAKE_LOCK" => Some((true, Payload::StakeLock(StakeLock {
            amount: str_field(data, "amount"),
            months: u64_field(data, "months"),
            effective_stake: str_field(data, "effective_stake"),
        }))),

        "STAKE_EXTEND" => Some((true, Payload::StakeExtend(StakeExtend {
            new_months: u64_field(data, "new_months"),
            new_effective: str_field(data, "new_effective"),
        }))),

        "STAKE_UNLOCK" => Some((true, Payload::StakeUnlock(StakeUnlock {
            amount: str_field(data, "amount"),
        }))),

        "REWARDS_RELEASED" => Some((true, Payload::RewardsReleased(RewardsReleased {
            amount: str_field(data, "amount"),
            elapsed_ns: str_field(data, "elapsed_ns"),
            total_released: str_field(data, "total_released"),
            remaining_pool: str_field(data, "remaining_pool"),
        }))),

        "REWARDS_CLAIM" => Some((true, Payload::RewardsClaim(RewardsClaim {
            amount: str_field(data, "amount"),
        }))),

        "CREDITS_PURCHASE" => Some((true, Payload::CreditsPurchase(CreditsPurchase {
            amount: str_field(data, "amount"),
            infra_share: str_field(data, "infra_share"),
            rewards_share: str_field(data, "rewards_share"),
        }))),

        "SCHEDULED_FUND" => Some((true, Payload::ScheduledFund(ScheduledFund {
            amount: str_field(data, "amount"),
            total_pool: str_field(data, "total_pool"),
        }))),

        "INFRA_WITHDRAW" => Some((true, Payload::InfraWithdraw(InfraWithdraw {
            amount: str_field(data, "amount"),
            receiver_id: str_field(data, "receiver_id"),
        }))),

        "OWNER_CHANGED" => Some((true, Payload::OwnerChanged(OwnerChanged {
            old_owner: str_field(data, "old_owner"),
            new_owner: str_field(data, "new_owner"),
        }))),

        "CONTRACT_UPGRADE" => Some((true, Payload::ContractUpgrade(ContractUpgrade {
            old_version: u32_field(data, "old_version"),
            new_version: u32_field(data, "new_version"),
        }))),

        "STORAGE_DEPOSIT" => Some((true, Payload::StorageDeposit(StorageDeposit {
            deposit: str_field(data, "deposit"),
        }))),

        "UNLOCK_FAILED" => Some((false, Payload::UnlockFailed(UnlockFailed {
            amount: str_field(data, "amount"),
        }))),

        "CLAIM_FAILED" => Some((false, Payload::ClaimFailed(ClaimFailed {
            amount: str_field(data, "amount"),
        }))),

        "WITHDRAW_INFRA_FAILED" => Some((false, Payload::WithdrawInfraFailed(WithdrawInfraFailed {
            amount: str_field(data, "amount"),
        }))),

        _ => None,
    }
}

fn str_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}

fn u64_field(data: &Value, key: &str) -> u64 {
    data.get(key)
        .and_then(|v| v.as_u64())
        .unwrap_or(0)
}

fn u32_field(data: &Value, key: &str) -> u32 {
    data.get(key)
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(0)
}
