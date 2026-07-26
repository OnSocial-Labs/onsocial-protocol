use crate::tests::test_utils::*;
use crate::*;
use near_sdk::testing_env;

fn app_id() -> String {
    "myapp".to_string()
}

fn moderator() -> AccountId {
    "mod.near".parse().unwrap()
}

fn setup_with_app() -> Contract {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());
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

#[test]
fn register_app_happy() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());

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
fn register_app_requires_confirmation_deposit() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());

    let err = contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}

#[test]
fn register_app_duplicate_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn register_app_invalid_slug_fails() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::RegisterApp {
            app_id: "Bad_Slug".to_string(),
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

#[test]
fn register_app_any_wallet_can_own_slug() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());

    contract
        .execute(make_request(Action::RegisterApp {
            app_id: "buyer-app".to_string(),
            params: AppConfig::default(),
        }))
        .unwrap();

    let pool = contract.app_pools.get("buyer-app").unwrap();
    assert_eq!(pool.owner_id, buyer());
}

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

    let missing = "nope".to_string();
    let err = contract
        .execute(make_request(Action::SetAppConfig {
            app_id: missing,
            params: AppConfig::default(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

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

#[test]
fn add_approved_creator_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(pool.approved_creators.contains(&creator()));
}

#[test]
fn add_approved_creator_duplicate_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn add_approved_creator_outsider_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(buyer(), 1).build());

    let err = contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn moderator_can_add_and_remove_approved_creator() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    testing_env!(context_with_deposit(moderator(), 1).build());
    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    assert!(
        contract
            .app_pools
            .get(&app_id())
            .unwrap()
            .approved_creators
            .contains(&creator())
    );

    contract
        .execute(make_request(Action::RemoveApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();
    assert!(
        !contract
            .app_pools
            .get(&app_id())
            .unwrap()
            .approved_creators
            .contains(&creator())
    );
}

#[test]
fn removed_moderator_cannot_approve_creators() {
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

    testing_env!(context_with_deposit(moderator(), 1).build());
    let err = contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn approved_creator_cannot_approve_others() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    testing_env!(context_with_deposit(creator(), 1).build());
    let err = contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: buyer(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn remove_approved_creator_happy() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    contract
        .execute(make_request(Action::RemoveApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(!pool.approved_creators.contains(&creator()));
}

#[test]
fn remove_approved_creator_not_found_fails() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    let err = contract
        .execute(make_request(Action::RemoveApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

#[test]
fn set_app_config_creator_access_open_clears_legacy_curated() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());

    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                curated: Some(true),
                ..Default::default()
            },
        }))
        .unwrap();
    assert!(contract.app_pools.get(&app_id()).unwrap().curated);
    assert_eq!(
        contract
            .app_pools
            .get(&app_id())
            .unwrap()
            .effective_creator_access(),
        CreatorAccess::InviteOnly
    );

    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                creator_access: Some(CreatorAccess::Open),
                ..Default::default()
            },
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(!pool.curated, "explicit open must clear legacy curated");
    assert_eq!(pool.creator_access, CreatorAccess::Open);
    assert_eq!(pool.effective_creator_access(), CreatorAccess::Open);
}

#[test]
fn creator_access_open_allows_any_creator() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                creator_access: Some(CreatorAccess::Open),
                ..Default::default()
            },
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(pool.can_create_collection(&creator()));
    assert!(pool.can_create_collection(&buyer()));
}

#[test]
fn creator_access_invite_only_blocks_non_staff() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                creator_access: Some(CreatorAccess::InviteOnly),
                ..Default::default()
            },
        }))
        .unwrap();
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(pool.can_create_collection(&owner()));
    assert!(pool.can_create_collection(&moderator()));
    assert!(!pool.can_create_collection(&creator()));
}

#[test]
fn creator_access_approval_requires_roster() {
    let mut contract = setup_with_app();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract
        .execute(make_request(Action::SetAppConfig {
            app_id: app_id(),
            params: AppConfig {
                creator_access: Some(CreatorAccess::Approval),
                ..Default::default()
            },
        }))
        .unwrap();

    {
        let pool = contract.app_pools.get(&app_id()).unwrap();
        assert!(!pool.can_create_collection(&creator()));
    }

    contract
        .execute(make_request(Action::AddApprovedCreator {
            app_id: app_id(),
            account_id: creator(),
        }))
        .unwrap();

    let pool = contract.app_pools.get(&app_id()).unwrap();
    assert!(pool.can_create_collection(&creator()));
    assert!(!pool.can_create_collection(&buyer()));
}

#[test]
fn app_pool_borsh_append_defaults_creator_access_and_roster() {
    use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

    let pool = AppPool {
        owner_id: owner(),
        balance: near_sdk::json_types::U128(0),
        used_bytes: 0,
        max_user_bytes: 10_000,
        default_royalty: None,
        primary_sale_bps: 250,
        moderators: vec![moderator()],
        curated: true,
        metadata: Some(r#"{"name":"Legacy"}"#.into()),
        creator_access: CreatorAccess::Approval,
        approved_creators: vec![creator()],
    };

    let mut buf = Vec::new();
    pool.owner_id.serialize(&mut buf).unwrap();
    pool.balance.serialize(&mut buf).unwrap();
    pool.used_bytes.serialize(&mut buf).unwrap();
    pool.max_user_bytes.serialize(&mut buf).unwrap();
    pool.default_royalty.serialize(&mut buf).unwrap();
    pool.primary_sale_bps.serialize(&mut buf).unwrap();
    pool.moderators.serialize(&mut buf).unwrap();
    pool.curated.serialize(&mut buf).unwrap();
    pool.metadata.serialize(&mut buf).unwrap();

    let loaded = AppPool::try_from_slice(&buf).unwrap();
    assert_eq!(loaded.creator_access, CreatorAccess::Open);
    assert!(loaded.approved_creators.is_empty());
    assert!(loaded.curated);
    assert_eq!(
        loaded.effective_creator_access(),
        CreatorAccess::InviteOnly,
        "legacy curated=true maps Open → InviteOnly"
    );
    assert_eq!(loaded.primary_sale_bps, 250);
}
