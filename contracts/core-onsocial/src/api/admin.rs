use crate::{
    SocialError,
    config::{ContractInfo, GovernanceConfig},
    constants,
    events::{EventBatch, EventBuilder},
    state::{ContractStatus, models::SocialPlatform},
};
use near_sdk::{AccountId, Gas, NearToken, Promise, env, near, require, serde_json::Value};

use crate::api::guards::ContractGuards;

use crate::{Contract, ContractExt};

const GAS_MIGRATE: Gas = Gas::from_tgas(200);

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

    pub fn get_version(&self) -> String {
        self.platform.version.clone()
    }

    pub fn get_config(&self) -> GovernanceConfig {
        self.platform.config.clone()
    }

    /// Returns full contract metadata: manager, version, status, and governance config.
    pub fn get_contract_info(&self) -> ContractInfo {
        ContractInfo {
            manager: self.platform.manager.clone(),
            version: self.get_version(),
            status: self.get_contract_status(),
            config: self.get_config(),
        }
    }

    #[payable]
    #[handle_result]
    pub fn update_config(
        &mut self,
        update: crate::config::ConfigUpdate,
    ) -> Result<(), SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        ContractGuards::require_manager_one_yocto(&self.platform)?;
        let caller = SocialPlatform::current_caller();

        if let Err(msg) = self.platform.config.validate_patch(&update) {
            return Err(crate::invalid_input!(msg));
        }

        let old_config = self.platform.config.clone();
        self.platform.config.apply_patch(&update);

        let mut batch = EventBatch::new();
        let path = format!(
            "{}/contract/config",
            SocialPlatform::platform_pool_account().as_str()
        );
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

        self.platform
            .config
            .intents_executors
            .push(executor.clone());

        let mut batch = EventBatch::new();
        let path = format!(
            "{}/contract/intents_executors",
            SocialPlatform::platform_pool_account().as_str()
        );
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

        let pos = self
            .platform
            .config
            .intents_executors
            .iter()
            .position(|e| e == &executor)
            .ok_or_else(|| crate::invalid_input!("Executor not found"))?;

        self.platform.config.intents_executors.remove(pos);

        let mut batch = EventBatch::new();
        let path = format!(
            "{}/contract/intents_executors",
            SocialPlatform::platform_pool_account().as_str()
        );
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
        let path = format!(
            "{}/contract/manager",
            SocialPlatform::platform_pool_account().as_str()
        );
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

    pub fn update_contract(&self) -> Promise {
        require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Attach 1 yoctoNEAR"
        );
        require!(
            env::predecessor_account_id() == self.platform.manager,
            "Not manager"
        );
        let code = env::input().expect("No input").to_vec();
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_MIGRATE,
            )
            .as_return()
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old_version = contract.platform.version.clone();
        contract.platform.version = env!("CARGO_PKG_VERSION").to_string();

        let caller = SocialPlatform::current_caller();
        let path = format!(
            "{}/contract/upgrade",
            SocialPlatform::platform_pool_account().as_str()
        );

        let mut batch = EventBatch::new();
        EventBuilder::new(
            constants::EVENT_TYPE_CONTRACT_UPDATE,
            "contract_upgrade",
            caller,
        )
        .with_path(&path)
        .with_field("old_version", old_version.as_str())
        .with_field("new_version", contract.platform.version.as_str())
        .emit(&mut batch);
        // Best-effort emit during migration; ignore errors
        let _ = batch.emit();

        contract
    }
}
