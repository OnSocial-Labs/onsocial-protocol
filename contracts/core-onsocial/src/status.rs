use crate::{
    SocialError,
    constants::EVENT_TYPE_CONTRACT_UPDATE,
    events::{EventBatch, EventBuilder},
    state::{ContractStatus, SocialPlatform},
};

pub fn emit_status_event(
    previous: ContractStatus,
    new_status: ContractStatus,
    operation: &str,
) -> Result<(), SocialError> {
    let mut batch = EventBatch::new();
    // Contract-scoped path ensures stable partitioning.
    let contract_id = SocialPlatform::platform_pool_account();
    let path = format!("{}/contract/status", contract_id.as_str());

    EventBuilder::new(
        EVENT_TYPE_CONTRACT_UPDATE,
        operation,
        SocialPlatform::current_caller(),
    )
    .with_path(&path)
    .with_field("previous", format!("{:?}", previous))
    .with_field("new", format!("{:?}", new_status))
    .emit(&mut batch);
    batch.emit()
}

pub fn enter_read_only(platform: &mut SocialPlatform) -> Result<bool, SocialError> {
    platform.require_manager_one_yocto()?;
    if platform.status == ContractStatus::ReadOnly {
        return Ok(false);
    }
    if platform.status != ContractStatus::Live {
        return Err(crate::invalid_input!(
            "Invalid transition: can only enter ReadOnly from Live"
        ));
    }
    let previous = platform.status;
    platform.status = ContractStatus::ReadOnly;
    emit_status_event(previous, platform.status, "enter_read_only")?;
    Ok(true)
}

pub fn resume_live(platform: &mut SocialPlatform) -> Result<bool, SocialError> {
    platform.require_manager_one_yocto()?;
    if platform.status == ContractStatus::Live {
        return Ok(false);
    }
    if platform.status != ContractStatus::ReadOnly {
        return Err(crate::invalid_input!(
            "Invalid transition: can only resume Live from ReadOnly"
        ));
    }
    let previous = platform.status;
    platform.status = ContractStatus::Live;
    emit_status_event(previous, platform.status, "resume_live")?;
    Ok(true)
}

pub fn activate_contract(platform: &mut SocialPlatform) -> Result<bool, SocialError> {
    platform.require_manager_one_yocto()?;
    if platform.status == ContractStatus::Live {
        return Ok(false);
    }
    if platform.status != ContractStatus::Genesis {
        return Err(crate::invalid_input!(
            "Invalid transition: can only activate Live from Genesis"
        ));
    }
    let previous = platform.status;
    platform.status = ContractStatus::Live;
    emit_status_event(previous, platform.status, "activate_contract")?;
    Ok(true)
}
