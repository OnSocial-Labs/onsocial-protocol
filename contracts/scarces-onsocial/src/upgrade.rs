use crate::constants::GAS_MIGRATE_TGAS;
use crate::*;

#[near]
impl Contract {
    pub fn update_contract(&self) -> Promise {
        near_sdk::require!(
            env::attached_deposit().as_yoctonear() == 1,
            "Attach 1 yoctoNEAR"
        );
        near_sdk::require!(
            env::predecessor_account_id() == self.owner_id,
            "Only contract owner can upgrade"
        );
        let code = env::input().expect("No input").to_vec();
        Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                Gas::from_tgas(GAS_MIGRATE_TGAS),
            )
            .as_return()
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
