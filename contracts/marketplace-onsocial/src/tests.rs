use near_sdk::test_utils::{accounts, VMContextBuilder};
use near_sdk::testing_env;

use super::*;

fn setup_contract() -> (VMContextBuilder, MarketplaceOnsocial) {
    let mut context = VMContextBuilder::new();
    testing_env!(context.predecessor_account_id(accounts(0)).build());
    let contract = MarketplaceOnsocial::new(accounts(0));
    (context, contract)
}

#[test]
fn test_new() {
    let (_, contract) = setup_contract();
    assert_eq!(
        contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Version should match package version"
    );
    assert_eq!(
        contract.state.manager,
        accounts(0),
        "Manager should be set correctly"
    );
}

#[test]
fn test_migrate() {
    let (context, _) = setup_contract();
    testing_env!(context.build());
    let contract = MarketplaceOnsocial::migrate();
    assert_eq!(
        contract.state.version,
        env!("CARGO_PKG_VERSION"),
        "Migrated version should match package version"
    );
}
