// --- Imports ---
use near_sdk::AccountId;
use serde_json::Value;

use crate::config::GovernanceConfig;
use crate::events::{EventBatch, EventBuilder};
use crate::state::models::SocialPlatform;
use crate::validation::validate_account_id;
use crate::{SocialError};

// --- Impl ---
impl SocialPlatform {
    /// Handle account-specific operations (active, manager, status, config)
    /// Returns true if the operation was handled, false if it should continue to other handlers
    pub fn handle_account_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
        success_paths: &mut Vec<String>,
    ) -> Result<bool, SocialError> {
        match path {
            "manager" => {
                let new_manager: AccountId = value
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .ok_or(crate::invalid_input!("invalid account"))?;
                validate_account_id(&new_manager)?;
                let old_manager = self.manager.clone();
                self.manager = new_manager.clone();

                EventBuilder::new(crate::constants::EVENT_TYPE_CONTRACT_UPDATE, "update", account_id.clone())
                    .with_path("manager")
                    .with_field("old_manager", old_manager.as_str())
                    .with_field("new_manager", new_manager.as_str())
                    .emit(event_batch);

                success_paths.push(path.to_string());
                Ok(true)
            }
            "status/read_only" => {
                near_sdk::assert_one_yocto();
                crate::status::enter_read_only(self);
                success_paths.push(path.to_string());
                Ok(true)
            }
            "status/live" => {
                near_sdk::assert_one_yocto();
                crate::status::resume_live(self);
                success_paths.push(path.to_string());
                Ok(true)
            }
            "status/activate" => {
                near_sdk::assert_one_yocto();
                crate::status::activate_contract(self);
                success_paths.push(path.to_string());
                Ok(true)
            }
            "config" => {
                let config: GovernanceConfig = serde_json::from_value(value.clone())
                    .map_err(|_| crate::invalid_input!("invalid config"))?;
                let old_config = self.config.clone();
                self.config = config.clone();

                EventBuilder::new(crate::constants::EVENT_TYPE_CONTRACT_UPDATE, "update", account_id.clone())
                    .with_path("config")
                    .with_field("old_config", serde_json::to_value(old_config).unwrap_or(Value::Null))
                    .with_field("new_config", serde_json::to_value(config).unwrap_or(Value::Null))
                    .emit(event_batch);

                success_paths.push(path.to_string());
                Ok(true)
            }
            _ => Ok(false)
        }
    }
}