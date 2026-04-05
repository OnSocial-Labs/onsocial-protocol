use near_sdk::serde_json::{self, Value};
use near_sdk::{AccountId, env};

const STANDARD: &str = "onsocial";
const VERSION: &str = "1.0.0";

pub(crate) fn emit(event: &str, account_id: &AccountId, mut data: Value) {
    if let Value::Object(ref mut map) = data {
        map.insert(
            "account_id".into(),
            serde_json::json!(account_id.to_string()),
        );
    }
    let log = serde_json::json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data]
    });
    env::log_str(&format!("EVENT_JSON:{}", log));
}

pub fn emit_reward_credited(
    account_id: &AccountId,
    amount: u128,
    source: Option<&str>,
    credited_by: &AccountId,
    app_id: Option<&str>,
) {
    emit(
        "REWARD_CREDITED",
        account_id,
        serde_json::json!({
            "amount": amount.to_string(),
            "source": source.unwrap_or("unspecified"),
            "credited_by": credited_by.to_string(),
            "app_id": app_id.unwrap_or("global"),
        }),
    );
}

pub fn emit_reward_claimed(account_id: &AccountId, amount: u128) {
    emit(
        "REWARD_CLAIMED",
        account_id,
        serde_json::json!({
            "amount": amount.to_string(),
        }),
    );
}

pub fn emit_claim_failed(account_id: &AccountId, amount: u128) {
    emit(
        "CLAIM_FAILED",
        account_id,
        serde_json::json!({
            "amount": amount.to_string(),
        }),
    );
}

pub fn emit_pool_deposit(sender_id: &AccountId, amount: u128, new_balance: u128) {
    emit(
        "POOL_DEPOSIT",
        sender_id,
        serde_json::json!({
            "amount": amount.to_string(),
            "new_balance": new_balance.to_string(),
        }),
    );
}

pub fn emit_owner_transferred(old_owner: &AccountId, new_owner: &AccountId) {
    emit(
        "OWNER_CHANGED",
        old_owner,
        serde_json::json!({
            "new_owner": new_owner.to_string(),
        }),
    );
}

pub fn emit_max_daily_updated(owner_id: &AccountId, old_max: u128, new_max: u128) {
    emit(
        "MAX_DAILY_UPDATED",
        owner_id,
        serde_json::json!({
            "old_max": old_max.to_string(),
            "new_max": new_max.to_string(),
        }),
    );
}

pub fn emit_intents_executor_added(owner_id: &AccountId, executor: &AccountId) {
    emit(
        "EXECUTOR_ADDED",
        owner_id,
        serde_json::json!({
            "executor": executor.to_string(),
        }),
    );
}

pub fn emit_intents_executor_removed(owner_id: &AccountId, executor: &AccountId) {
    emit(
        "EXECUTOR_REMOVED",
        owner_id,
        serde_json::json!({
            "executor": executor.to_string(),
        }),
    );
}

pub fn emit_authorized_caller_added(owner_id: &AccountId, caller: &AccountId) {
    emit(
        "CALLER_ADDED",
        owner_id,
        serde_json::json!({
            "caller": caller.to_string(),
        }),
    );
}

pub fn emit_authorized_caller_removed(owner_id: &AccountId, caller: &AccountId) {
    emit(
        "CALLER_REMOVED",
        owner_id,
        serde_json::json!({
            "caller": caller.to_string(),
        }),
    );
}

pub fn emit_contract_upgraded(account_id: &AccountId, old_version: &str, new_version: &str) {
    emit(
        "CONTRACT_UPGRADE",
        account_id,
        serde_json::json!({
            "old_version": old_version,
            "new_version": new_version,
        }),
    );
}
