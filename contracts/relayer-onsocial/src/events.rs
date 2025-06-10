use crate::state::Relayer;
use near_sdk::json_types::U128;
use near_sdk::{env, AccountId};

fn log_event(_relayer: &Relayer, event_type: &str, fields: &[(&str, Option<String>)]) {
    let code = match event_type {
        "TxProc" => 1,
        "TxRej" => 2,
        "Dep" => 3,
        "FOff" => 4,
        "CfgChg" => 5,
        "CUpg" => 6,
        "SMig" => 7,
        "CInit" => 9,
        "DbgChg" => 10,
        "Paused" => 11,
        "Unpaused" => 12,
        "NRes" => 13,
        _ => 0,
    };
    let mut log = format!("{{\"t\":{},\"event\":\"{}\"", code, event_type);
    for (k, v) in fields {
        if let Some(val) = v {
            log.push_str(&format!(",\"{}\":{}", k, val));
        }
    }
    log.push('}');
    env::log_str(&log);
}

pub struct TxProcMeta<'a> {
    pub gas_used: Option<u64>,
    pub error_detail: Option<&'a str>,
}

pub struct LogTxProcessedArgs<'a> {
    pub relayer: &'a Relayer,
    pub sender_id: &'a AccountId,
    pub action_type: &'a str,
    pub amount: U128,
    pub signature_verified: bool,
    pub timestamp: u64,
    pub action_context: &'a str,
    pub meta: Option<TxProcMeta<'a>>,
}

pub fn log_transaction_processed(args: LogTxProcessedArgs) {
    let LogTxProcessedArgs {
        relayer,
        sender_id,
        action_type,
        amount,
        signature_verified,
        timestamp,
        action_context,
        meta,
    } = args;
    let mut fields = vec![
        ("s", Some(format!("\"{}\"", sender_id))),
        ("at", Some(format!("\"{}\"", action_type))),
        ("a", Some(amount.0.to_string())),
        ("sv", Some(signature_verified.to_string())),
        ("ts", Some(timestamp.to_string())),
    ];
    fields.push(("ctx", Some(format!("\"{}\"", action_context))));
    if let Some(meta) = &meta {
        if let Some(gas) = meta.gas_used {
            fields.push(("gu", Some(gas.to_string())));
        }
        if let Some(err) = meta.error_detail {
            fields.push(("ed", Some(format!("\"{}\"", err))));
        }
    }
    log_event(relayer, "TxProc", &fields);
}

pub fn log_transaction_rejected(
    relayer: &Relayer,
    sender_id: &AccountId,
    amount: U128,
    reason: &str,
    timestamp: u64,
    action_context: &str, // <-- added
    meta: Option<TxProcMeta>,
) {
    let mut fields = vec![
        ("s", Some(format!("\"{}\"", sender_id))),
        ("a", Some(amount.0.to_string())),
        ("r", Some(format!("\"{}\"", reason))),
        ("ts", Some(timestamp.to_string())),
    ];
    fields.push(("ctx", Some(format!("\"{}\"", action_context))));
    if let Some(meta) = &meta {
        if let Some(gas) = meta.gas_used {
            fields.push(("gu", Some(gas.to_string())));
        }
        if let Some(err) = meta.error_detail {
            fields.push(("ed", Some(format!("\"{}\"", err))));
        }
    }
    log_event(relayer, "TxRej", &fields);
}

pub fn log_deposit_event(
    relayer: &Relayer,
    status: &str,
    sender_id: &AccountId,
    amount: U128,
    new_balance: Option<U128>,
    timestamp: u64,
) {
    assert!(status == "received", "Invalid deposit status");
    let nb = new_balance.map(|nb| nb.0.to_string());
    log_event(
        relayer,
        "Dep",
        &[
            ("st", Some(format!("\"{}\"", status))),
            ("s", Some(format!("\"{}\"", sender_id))),
            ("a", Some(amount.0.to_string())),
            ("nb", nb),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_funds_offloaded(relayer: &Relayer, amount: u128, recipient: &AccountId, timestamp: u64) {
    log_event(
        relayer,
        "FOff",
        &[
            ("a", Some(amount.to_string())),
            ("rec", Some(format!("\"{}\"", recipient))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_config_changed(
    relayer: &Relayer,
    config_type: &str,
    old_value: &str,
    new_value: &str,
    sender_id: &AccountId,
    timestamp: u64,
) {
    log_event(
        relayer,
        "CfgChg",
        &[
            ("ct", Some(format!("\"{}\"", config_type))),
            ("ov", Some(format!("\"{}\"", old_value))),
            ("nv", Some(format!("\"{}\"", new_value))),
            ("cb", Some(format!("\"{}\"", sender_id))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_contract_upgraded(relayer: &Relayer, manager: &AccountId, timestamp: u64) {
    log_event(
        relayer,
        "CUpg",
        &[
            ("m", Some(format!("\"{}\"", manager))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_state_migrated(relayer: &Relayer, old_version: &str, new_version: &str) {
    log_event(
        relayer,
        "SMig",
        &[
            ("ov", Some(format!("\"{}\"", old_version))),
            ("nv", Some(format!("\"{}\"", new_version))),
        ],
    );
}

pub fn log_contract_initialized(
    relayer: &Relayer,
    manager: &AccountId,
    whitelist_size: u32,
    timestamp: u64,
) {
    log_event(
        relayer,
        "CInit",
        &[
            ("m", Some(format!("\"{}\"", manager))),
            ("ws", Some(whitelist_size.to_string())),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_paused(relayer: &Relayer, paused_by: &AccountId, timestamp: u64) {
    log_event(
        relayer,
        "Paused",
        &[
            ("by", Some(format!("\"{}\"", paused_by))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_unpaused(relayer: &Relayer, unpaused_by: &AccountId, timestamp: u64) {
    log_event(
        relayer,
        "Unpaused",
        &[
            ("by", Some(format!("\"{}\"", unpaused_by))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}

pub fn log_nonce_reset(relayer: &Relayer, account_id: &AccountId, timestamp: u64) {
    log_event(
        relayer,
        "NRes",
        &[
            ("s", Some(format!("\"{}\"", account_id))),
            ("ts", Some(timestamp.to_string())),
        ],
    );
}
