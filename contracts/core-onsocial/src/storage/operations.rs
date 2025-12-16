// --- External imports ---
use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;
use serde::{Deserialize, Serialize};
use serde_json::Value;

// --- Internal imports ---
use crate::{errors::SocialError, invalid_input};

// --- Types ---
/// Alias for token/yocto balances used for storage accounting.
type Balance = u128;

// --- Helper Functions ---

/// Parse amount from JSON value, supporting both string and number formats.
/// Returns None for null values (used for full withdrawal).
#[inline(always)]
fn parse_amount(value: &Value) -> Result<Option<Balance>, SocialError> {
    if value.is_null() {
        return Ok(None);
    }
    if let Some(s) = value.as_str() {
        return s
            .parse::<u128>()
            .map(Some)
            .map_err(|_| invalid_input!("Invalid amount format"));
    }
    if value.is_number() {
        // Use to_string representation to avoid u64 limitation of as_u64 for large u128 values
        let num_str = value.to_string();
        return num_str
            .parse::<u128>()
            .map(Some)
            .map_err(|_| invalid_input!("Invalid numeric amount"));
    }
    Err(invalid_input!("Amount must be string, number, or null"))
}

// --- Enums ---
/// Operations that modify or query storage-related state.
#[derive(NearSchema, BorshDeserialize, BorshSerialize, Deserialize, Serialize, Debug)]
#[abi(borsh, json)]
pub enum StorageOperation {
    /// Deposit storage funds for the caller's account.
    Deposit {
        depositor: AccountId,
        amount: Balance,
    },

    /// Withdraw storage funds (partial or full) for the caller.
    Withdraw {
        amount: Option<Balance>,
        depositor: AccountId,
    },

    /// Deposit into a shared storage pool identified by `pool_id`.
    SharedPoolDeposit {
        pool_id: AccountId,
        amount: Balance,
    },

    /// Share storage capacity with `target_id` up to `max_bytes`.
    ShareStorage {
        target_id: AccountId,
        max_bytes: u64,
    },

    /// Return previously allocated shared storage back to the pool.
    ReturnSharedStorage,
}

// --- Public API ---

/// Parse storage operation from path and value.
#[inline(always)]
pub fn parse_storage_operation(path: &str, value: &Value) -> Result<StorageOperation, SocialError> {
    let parts: Vec<&str> = path.split('/').collect();
    if parts.len() < 2 || parts[0] != "storage" {
        return Err(invalid_input!("Invalid storage path"));
    }
    match parts[1] {
        "deposit" => {
            let depositor = value
                .get("depositor")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| invalid_input!("depositor required"))?;
            let amount = parse_amount(
                value
                    .get("amount")
                    .ok_or_else(|| invalid_input!("amount required"))?,
            )?
            .ok_or_else(|| invalid_input!("amount cannot be null for deposit"))?;
            Ok(StorageOperation::Deposit { depositor, amount })
        }
        "withdraw" => {
            let amount = parse_amount(
                value
                    .get("amount")
                    .ok_or_else(|| invalid_input!("amount required"))?,
            )?;
            let depositor = value
                .get("depositor")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| invalid_input!("depositor required"))?;
            Ok(StorageOperation::Withdraw { amount, depositor })
        }
        "shared_pool_deposit" => {
            let pool_id = value
                .get("pool_id")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| invalid_input!("pool_id required"))?;
            let amount = parse_amount(
                value
                    .get("amount")
                    .ok_or_else(|| invalid_input!("amount required"))?,
            )?
            .ok_or_else(|| invalid_input!("amount cannot be null for shared_pool_deposit"))?;
            Ok(StorageOperation::SharedPoolDeposit { pool_id, amount })
        }
        "share_storage" => {
            let target_id = value
                .get("target_id")
                .and_then(|v| v.as_str())
                .and_then(|s| s.parse().ok())
                .ok_or_else(|| invalid_input!("target_id required"))?;
            let max_bytes = value
                .get("max_bytes")
                .and_then(|v| v.as_u64())
                .ok_or_else(|| invalid_input!("max_bytes required"))?;
            Ok(StorageOperation::ShareStorage {
                target_id,
                max_bytes,
            })
        }
        "return_shared_storage" => Ok(StorageOperation::ReturnSharedStorage),
        _ => Err(invalid_input!("Unknown storage operation")),
    }
}

// --- Impl ---
impl crate::state::SocialPlatform {
    // --- Public API ---
    /// Return storage metadata for `account_id` if present.
    /// Constructs Storage struct from separate storage fields for efficiency.
    pub fn get_account_storage(&self, account_id: &str) -> Option<crate::storage::Storage> {
        let account_id_parsed: near_sdk::AccountId = account_id.parse().ok()?;
        self.user_storage.get(&account_id_parsed).cloned()
    }
}

// --- Public API ---
