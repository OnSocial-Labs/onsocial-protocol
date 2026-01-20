use near_sdk::{env, near, AccountId, Gas, NearToken, Promise};

#[near(contract_state)]
#[derive(Default)]
pub struct ManagerProxy {}

#[near]
impl ManagerProxy {
    #[init]
    pub fn new() -> Self {
        Self {}
    }

    /// Calls `update_config` on the target core-onsocial contract.
    ///
    /// Intended for use when this contract is set as the core contract `manager`.
    pub fn update_core_config(
        &self,
        core_account_id: AccountId,
        update: near_sdk::serde_json::Value,
    ) -> Promise {
        let args = near_sdk::serde_json::json!({ "update": update });
        let Ok(args) = near_sdk::serde_json::to_vec(&args) else {
            env::panic_str("Failed to serialize update_config args");
        };

        Promise::new(core_account_id).function_call(
            "update_config".to_string(),
            args,
            NearToken::from_yoctonear(1),
            Gas::from_tgas(50),
        )
    }
}
