// --- Imports ---
use crate::errors::SocialError;
use crate::{
    constants::EVENT_TYPE_CONTRACT_UPDATE,
    events::EventBatch,
    state::{ContractStatus, SocialPlatform},
};
use near_sdk::FunctionError;
use serde_json::json;

// --- Manager Assertion ---
/// Ensures the current caller is the contract manager
pub fn assert_manager(platform: &SocialPlatform) {
    if platform.manager != SocialPlatform::current_caller() {
        crate::unauthorized!(
            "manager_operation",
            SocialPlatform::current_caller().to_string()
        )
        .panic();
    }
}

// --- Status Event Emission ---
/// Emits a contract status change event
pub fn emit_status_event(
    previous: ContractStatus,
    new_status: ContractStatus,
    operation: &str,
) {
    let mut batch = EventBatch::new();
    batch.add(
        EVENT_TYPE_CONTRACT_UPDATE,
        operation,
        &SocialPlatform::current_caller(),
        json!({
            "previous": format!("{:?}", previous),
            "new": format!("{:?}", new_status),
        }),
    );
    let _ = batch.emit(&None);
}

// --- Status Transition Functions ---
/// Enter read-only mode (only allowed by manager)
pub fn enter_read_only(platform: &mut SocialPlatform) -> bool {
    near_sdk::assert_one_yocto();
    assert_manager(platform);
    if platform.status == ContractStatus::ReadOnly {
        return false;
    }
    if platform.status != ContractStatus::Live {
        near_sdk::env::panic_str("Invalid transition: can only enter ReadOnly from Live");
    }
    let previous = platform.status;
    platform.status = ContractStatus::ReadOnly;
    emit_status_event(previous, platform.status, "enter_read_only");
    true
}

/// Resume live mode (only allowed by manager)
pub fn resume_live(platform: &mut SocialPlatform) -> bool {
    near_sdk::assert_one_yocto();
    assert_manager(platform);
    if platform.status == ContractStatus::Live {
        return false;
    }
    if platform.status != ContractStatus::ReadOnly {
        near_sdk::env::panic_str("Invalid transition: can only resume Live from ReadOnly");
    }
    let previous = platform.status;
    platform.status = ContractStatus::Live;
    emit_status_event(previous, platform.status, "resume_live");
    true
}

/// Activate contract from Genesis to Live (only allowed by manager, one-time operation)
pub fn activate_contract(platform: &mut SocialPlatform) -> bool {
    near_sdk::assert_one_yocto();
    assert_manager(platform);
    if platform.status == ContractStatus::Live {
        return false;
    }
    if platform.status != ContractStatus::Genesis {
        near_sdk::env::panic_str("Invalid transition: can only activate Live from Genesis");
    }
    let previous = platform.status;
    platform.status = ContractStatus::Live;
    emit_status_event(previous, platform.status, "activate_contract");
    true
}
