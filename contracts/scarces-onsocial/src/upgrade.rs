use crate::constants::GAS_MIGRATE_TGAS;
use crate::*;
use near_sdk::json_types::Base58CryptoHash;

#[near]
impl Contract {
    #[handle_result]
    pub fn update_contract(&self) -> Result<Promise, MarketplaceError> {
        self.check_contract_owner(&env::predecessor_account_id())?;
        let code = env::input().expect("No input").to_vec();
        Ok(Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                Gas::from_tgas(GAS_MIGRATE_TGAS),
            )
            .as_return())
    }

    #[handle_result]
    pub fn update_contract_from_hash(
        &self,
        code_hash: Base58CryptoHash,
    ) -> Result<Promise, MarketplaceError> {
        self.check_contract_owner(&env::predecessor_account_id())?;
        Ok(Promise::new(env::current_account_id())
            .use_global_contract(code_hash)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                Gas::from_tgas(GAS_MIGRATE_TGAS),
            )
            .as_return())
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old_version = contract.version.clone();
        contract.version = env!("CARGO_PKG_VERSION").to_string();

        events::emit_contract_upgraded(&env::current_account_id(), &old_version, &contract.version);

        contract
    }
}
