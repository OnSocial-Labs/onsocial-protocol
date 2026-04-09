//! Boost event decoder
//!
//! Decodes NEP-297 events from boost-onsocial contract logs.
//! Events: BOOST_LOCK, BOOST_EXTEND, BOOST_UNLOCK, REWARDS_RELEASED,
//!         REWARDS_CLAIM, CREDITS_PURCHASE, SCHEDULED_FUND, INFRA_WITHDRAW,
//!         OWNER_CHANGED, CONTRACT_UPGRADE, STORAGE_DEPOSIT,
//!         UNLOCK_FAILED, CLAIM_FAILED, WITHDRAW_INFRA_FAILED

use crate::pb::boost::v1::boost_event::Payload;
use crate::pb::boost::v1::*;
use serde_json::Value;

pub fn decode_boost_event(
    json_data: &str,
    receipt_id: &str,
    block_height: u64,
    block_timestamp: u64,
    log_index: usize,
) -> Option<BoostEvent> {
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

    Some(BoostEvent {
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
        "BOOST_LOCK" => Some((
            true,
            Payload::BoostLock(BoostLock {
                amount: str_field(data, "amount"),
                months: u64_field(data, "months"),
                effective_boost: str_field(data, "effective_boost"),
            }),
        )),

        "BOOST_EXTEND" => Some((
            true,
            Payload::BoostExtend(BoostExtend {
                new_months: u64_field(data, "new_months"),
                new_effective_boost: str_field(data, "new_effective_boost"),
            }),
        )),

        "BOOST_UNLOCK" => Some((
            true,
            Payload::BoostUnlock(BoostUnlock {
                amount: str_field(data, "amount"),
            }),
        )),

        "REWARDS_RELEASED" => Some((
            true,
            Payload::RewardsReleased(RewardsReleased {
                amount: str_field(data, "amount"),
                elapsed_ns: str_field(data, "elapsed_ns"),
                total_released: str_field(data, "total_released"),
                remaining_pool: str_field(data, "remaining_pool"),
            }),
        )),

        "REWARDS_CLAIM" => Some((
            true,
            Payload::RewardsClaim(RewardsClaim {
                amount: str_field(data, "amount"),
            }),
        )),

        "CREDITS_PURCHASE" => Some((
            true,
            Payload::CreditsPurchase(CreditsPurchase {
                amount: str_field(data, "amount"),
                infra_share: str_field(data, "infra_share"),
                rewards_share: str_field(data, "rewards_share"),
            }),
        )),

        "SCHEDULED_FUND" => Some((
            true,
            Payload::ScheduledFund(ScheduledFund {
                amount: str_field(data, "amount"),
                total_pool: str_field(data, "total_pool"),
            }),
        )),

        "INFRA_WITHDRAW" => Some((
            true,
            Payload::InfraWithdraw(InfraWithdraw {
                amount: str_field(data, "amount"),
                receiver_id: str_field(data, "receiver_id"),
            }),
        )),

        "OWNER_CHANGED" => Some((
            true,
            Payload::OwnerChanged(OwnerChanged {
                old_owner: str_field(data, "old_owner"),
                new_owner: str_field(data, "new_owner"),
            }),
        )),

        "CONTRACT_UPGRADE" => Some((
            true,
            Payload::ContractUpgrade(ContractUpgrade {
                old_version: str_field(data, "old_version"),
                new_version: str_field(data, "new_version"),
            }),
        )),

        "STORAGE_DEPOSIT" => Some((
            true,
            Payload::StorageDeposit(StorageDeposit {
                deposit: str_field(data, "deposit"),
            }),
        )),

        "UNLOCK_FAILED" => Some((
            false,
            Payload::UnlockFailed(UnlockFailed {
                amount: str_field(data, "amount"),
            }),
        )),

        "CLAIM_FAILED" => Some((
            false,
            Payload::ClaimFailed(ClaimFailed {
                amount: str_field(data, "amount"),
            }),
        )),

        "WITHDRAW_INFRA_FAILED" => Some((
            false,
            Payload::WithdrawInfraFailed(WithdrawInfraFailed {
                amount: str_field(data, "amount"),
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

fn u64_field(data: &Value, key: &str) -> u64 {
    data.get(key).and_then(|v| v.as_u64()).unwrap_or(0)
}
