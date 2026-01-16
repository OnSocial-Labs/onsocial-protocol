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
    pub fn patch_config(
        &mut self,
        max_key_length: Option<u16>,
        max_path_depth: Option<u16>,
        max_batch_size: Option<u16>,
        max_value_bytes: Option<u32>,
        platform_onboarding_bytes: Option<u64>,
        platform_daily_refill_bytes: Option<u64>,
        platform_allowance_max_bytes: Option<u64>,
        intents_executors: Option<Vec<AccountId>>,
    ) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        if let Err(msg) = self.platform.config.validate_patch(
            max_key_length,
            max_path_depth,
            max_batch_size,
            max_value_bytes,
            intents_executors.as_deref(),
        ) {
            return Err(crate::invalid_input!(msg));
        }

        let old_config = self.platform.config.clone();

        if let Some(v) = max_key_length {
            self.platform.config.max_key_length = v;
        }
        if let Some(v) = max_path_depth {
            self.platform.config.max_path_depth = v;
        }
        if let Some(v) = max_batch_size {
            self.platform.config.max_batch_size = v;
        }
        if let Some(v) = max_value_bytes {
            self.platform.config.max_value_bytes = v;
        }
        if let Some(v) = platform_onboarding_bytes {
            self.platform.config.platform_onboarding_bytes = v;
        }
        if let Some(v) = platform_daily_refill_bytes {
            self.platform.config.platform_daily_refill_bytes = v;
        }
        if let Some(v) = platform_allowance_max_bytes {
            self.platform.config.platform_allowance_max_bytes = v;
        }
        if let Some(v) = intents_executors {
            self.platform.config.intents_executors = v;
        }

        let mut batch = EventBatch::new();
        let path = format!("{}/contract/config", SocialPlatform::platform_pool_account().as_str());
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "patch_config",
            caller,
        )
        .with_path(&path)
        .with_field(
            "old_config",
            near_sdk::serde_json::to_value(old_config).unwrap_or(Value::Null),
        )
        .with_field(
            "new_config",
            near_sdk::serde_json::to_value(self.platform.config.clone()).unwrap_or(Value::Null),
        )
        .emit(&mut batch);
        batch.emit()?;

        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn add_intents_executor(&mut self, executor: AccountId) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        if self.platform.config.intents_executors.contains(&executor) {
            return Err(crate::invalid_input!("Executor already exists"));
        }
        if self.platform.config.intents_executors.len() >= 50 {
            return Err(crate::invalid_input!("Too many intents executors"));
        }

        self.platform.config.intents_executors.push(executor.clone());

        let mut batch = EventBatch::new();
        let path = format!("{}/contract/intents_executors", SocialPlatform::platform_pool_account().as_str());
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "add_intents_executor",
            caller,
        )
        .with_path(&path)
        .with_field("executor", executor.as_str())
        .emit(&mut batch);
        batch.emit()?;

        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn remove_intents_executor(&mut self, executor: AccountId) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        let pos = self.platform.config.intents_executors
            .iter()
            .position(|e| e == &executor)
            .ok_or_else(|| crate::invalid_input!("Executor not found"))?;

        self.platform.config.intents_executors.remove(pos);

        let mut batch = EventBatch::new();
        let path = format!("{}/contract/intents_executors", SocialPlatform::platform_pool_account().as_str());
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "remove_intents_executor",
            caller,
        )
        .with_path(&path)
        .with_field("executor", executor.as_str())
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
