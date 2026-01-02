use crate::{
    config::GovernanceConfig,
    constants,
    events::{EventBatch, EventBuilder},
    state::{models::SocialPlatform, ContractStatus},
    SocialError,
};
use near_sdk::{near, serde_json::Value, AccountId};

use crate::api::guards::ContractGuards;

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    #[init]
    pub fn new() -> Self {
        Self {
            platform: SocialPlatform::new(),
        }
    }

    #[payable]
    #[handle_result]
    pub fn enter_read_only(&mut self) -> Result<bool, SocialError> {
        crate::status::enter_read_only(&mut self.platform)
    }

    #[payable]
    #[handle_result]
    pub fn resume_live(&mut self) -> Result<bool, SocialError> {
        crate::status::resume_live(&mut self.platform)
    }

    #[payable]
    #[handle_result]
    pub fn activate_contract(&mut self) -> Result<bool, SocialError> {
        crate::status::activate_contract(&mut self.platform)
    }

    pub fn get_contract_status(&self) -> ContractStatus {
        self.platform.status
    }

    pub fn get_config(&self) -> GovernanceConfig {
        self.platform.config.clone()
    }

    #[payable]
    #[handle_result]
    pub fn update_config(&mut self, config: GovernanceConfig) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        if let Err(msg) = config.validate_update(&self.platform.config) {
            return Err(crate::invalid_input!(msg));
        }

        let old_config = self.platform.config.clone();
        self.platform.config = config.clone();

        let mut batch = EventBatch::new();
        let path = format!("{}/contract/config", SocialPlatform::platform_pool_account().as_str());
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "update_config",
            caller,
        )
        .with_path(&path)
        .with_field(
            "old_config",
            near_sdk::serde_json::to_value(old_config).unwrap_or(Value::Null),
        )
        .with_field(
            "new_config",
            near_sdk::serde_json::to_value(config).unwrap_or(Value::Null),
        )
        .emit(&mut batch);
        batch.emit()?;

        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn update_manager(&mut self, new_manager: AccountId) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        let old_manager = self.platform.manager.clone();
        self.platform.manager = new_manager.clone();

        let mut batch = EventBatch::new();
        let path = format!("{}/contract/manager", SocialPlatform::platform_pool_account().as_str());
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "update_manager",
            caller,
        )
        .with_path(&path)
        .with_field("old_manager", old_manager.as_str())
        .with_field("new_manager", new_manager.as_str())
        .emit(&mut batch);
        batch.emit()?;

        Ok(())
    }
}
