use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

// --- Helpers ---

fn app_id() -> AccountId {
    "myapp.near".parse().unwrap()
}

fn moderator() -> AccountId {
    "mod.near".parse().unwrap()
}

fn setup_with_app() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    testing_env!(context(owner()).build());
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig {
                max_user_bytes: Some(10_000),
                ..Default::default()
            },
        }))
        .unwrap();
    contract
}

// ─── RegisterApp ─────────────────────────────────────────────────────────────

#[test]
fn register_app_happy() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    testing_env!(context(owner()).build());

    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap();

    assert!(contract.app_pools.contains_key(&app_id()));
    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert_eq!(pool.owner_id, owner());
}

#[test]
fn register_app_duplicate_fails() {
    let mut contract = setup_with_app();

    let err = contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn register_app_unauthorized_fails() {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    testing_env!(context(buyer()).build());

    let foreign_app: AccountId = "someone_else.near".parse().unwrap();
    let err = contract
        .execute(make_request(Action::RegisterApp {
            app_id: foreign_app,
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── SetAppConfig ────────────────────────────────────────────────────────────

#[test]
fn set_app_config_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                max_user_bytes: Some(20_000),
                curated: Some(true),
                ..Default::default()
            },
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert_eq!(pool.max_user_bytes, 20_000);
    assert!(pool.curated);
}

#[test]
fn set_app_config_non_owner_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn set_app_config_not_found_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

    let missing: AccountId = "nope.near".parse().unwrap();
    let err = contract
        .execute(make_request(Action::SetAppConfig {
            app_id: missing,
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// ─── TransferAppOwnership ────────────────────────────────────────────────────

#[test]
fn transfer_app_ownership_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::TransferAppOwnership {
            app_id: app_id(),
            new_owner: buyer(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert_eq!(pool.owner_id, buyer());
}

#[test]
fn transfer_app_ownership_non_owner_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::TransferAppOwnership {
            app_id: app_id(),
            new_owner: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── AddModerator ────────────────────────────────────────────────────────────

#[test]
fn add_moderator_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(pool.moderators.contains(&moderator()));
}

#[test]
fn add_moderator_duplicate_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn add_moderator_non_owner_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── RemoveModerator ─────────────────────────────────────────────────────────

#[test]
fn remove_moderator_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    contract
        .execute(make_request(Action::RemoveModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(!pool.moderators.contains(&moderator()));
}

#[test]
fn remove_moderator_not_found_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .execute(make_request(Action::RemoveModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn remove_moderator_non_owner_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::RemoveModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}
