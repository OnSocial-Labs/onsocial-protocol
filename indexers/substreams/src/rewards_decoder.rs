//! Rewards event decoder
//!
//! Decodes NEP-297 events from rewards-onsocial contract logs.
//! Events: REWARD_CREDITED, REWARD_CLAIMED, CLAIM_FAILED, POOL_DEPOSIT,
//!         OWNER_CHANGED, MAX_DAILY_UPDATED, EXECUTOR_ADDED,
//!         EXECUTOR_REMOVED, CALLER_ADDED, CALLER_REMOVED,
//!         CONTRACT_UPGRADE

use crate::pb::rewards::v1::rewards_event::Payload;
use crate::pb::rewards::v1::*;
use serde_json::Value;

pub fn decode_rewards_event(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Option<RewardsEvent> {
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

    Some(RewardsEvent {
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
        "REWARD_CREDITED" => Some((
            true,
            Payload::RewardCredited(RewardCredited {
                amount: str_field(data, "amount"),
                source: str_field(data, "source"),
                credited_by: str_field(data, "credited_by"),
                app_id: str_field(data, "app_id"),
            }),
        )),

        "REWARD_CLAIMED" => Some((
            true,
            Payload::RewardClaimed(RewardClaimed {
                amount: str_field(data, "amount"),
            }),
        )),

        "CLAIM_FAILED" => Some((
            false,
            Payload::ClaimFailed(ClaimFailed {
                amount: str_field(data, "amount"),
            }),
        )),

        "POOL_DEPOSIT" => Some((
            true,
            Payload::PoolDeposit(PoolDeposit {
                amount: str_field(data, "amount"),
                new_balance: str_field(data, "new_balance"),
            }),
        )),

        "OWNER_CHANGED" => Some((
            true,
            Payload::OwnerChanged(OwnerChanged {
                old_owner: str_field(data, "old_owner"),
                new_owner: str_field(data, "new_owner"),
            }),
        )),

        "MAX_DAILY_UPDATED" => Some((
            true,
            Payload::MaxDailyUpdated(MaxDailyUpdated {
                old_max: str_field(data, "old_max"),
                new_max: str_field(data, "new_max"),
            }),
        )),

        "EXECUTOR_ADDED" => Some((
            true,
            Payload::ExecutorAdded(ExecutorAdded {
                executor: str_field(data, "executor"),
            }),
        )),

        "EXECUTOR_REMOVED" => Some((
            true,
            Payload::ExecutorRemoved(ExecutorRemoved {
                executor: str_field(data, "executor"),
            }),
        )),

        "CALLER_ADDED" => Some((
            true,
            Payload::CallerAdded(CallerAdded {
                caller: str_field(data, "caller"),
            }),
        )),

        "CALLER_REMOVED" => Some((
            true,
            Payload::CallerRemoved(CallerRemoved {
                caller: str_field(data, "caller"),
            }),
        )),

        "CONTRACT_UPGRADE" => Some((
            true,
            Payload::ContractUpgrade(ContractUpgrade {
                old_version: str_field(data, "old_version"),
                new_version: str_field(data, "new_version"),
            }),
        )),

        _ => Some((
            true,
            Payload::UnknownEvent(UnknownEvent {
                extra_data: data.to_string(),
            }),
        )),
    }
}

fn str_field(data: &Value, key: &str) -> String {
    data.get(key)
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string()
}
