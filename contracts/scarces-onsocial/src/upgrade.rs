use crate::constants::GAS_MIGRATE_TGAS;
use crate::guards::check_one_yocto;
use crate::*;
use near_sdk::json_types::Base58CryptoHash;

#[near]
impl Contract {
    /// Owner-only self-upgrade. Requires 1 yoctoNEAR so FCAKs cannot deploy.
    #[payable]
    #[handle_result]
    pub fn update_contract(&mut self) -> Result<Promise, MarketplaceError> {
        check_one_yocto()?;
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

    /// Owner-only self-upgrade from a global contract hash. Requires 1 yoctoNEAR.
    #[payable]
    #[handle_result]
    pub fn update_contract_from_hash(
        &mut self,
        code_hash: Base58CryptoHash,
    ) -> Result<Promise, MarketplaceError> {
        check_one_yocto()?;
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

    /// Standard upgrade entrypoint: bump version / NEP-177 spec and emit.
    /// New AppPool / commission fields are Borsh-append-compatible (no rewrite).
    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old_version = contract.version.clone();
        contract.version = env!("CARGO_PKG_VERSION").to_string();
        contract.contract_metadata.spec = NFT_METADATA_SPEC.to_string();

        events::emit_contract_upgraded(&env::current_account_id(), &old_version, &contract.version);

        contract
    }
}
