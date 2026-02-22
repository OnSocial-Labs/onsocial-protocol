use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn app_id() -> AccountId {
    "myapp.near".parse().unwrap()
}

fn moderator() -> AccountId {
    "mod.near".parse().unwrap()
}

fn setup_with_app_collection(col_id: &str) -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    testing_env!(context(owner()).build());

    contract
        .execute(make_request(Action::RegisterApp {
            app_id: app_id(),
            params: AppConfig::default(),
        }))
        .unwrap();
    contract
        .execute(make_request(Action::AddModerator {
            app_id: app_id(),
            account_id: moderator(),
        }))
        .unwrap();

    testing_env!(context(creator()).build());
    let cfg = CollectionConfig {
        collection_id: col_id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(0),
        start_time: None,
        end_time: None,
        options: ScarceOptions {
            royalty: None,
            app_id: Some(app_id()),
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: collections::RevocationMode::None,
        max_redeems: None,
        mint_mode: collections::MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    contract
        .execute(make_request(Action::CreateCollection { params: cfg }))
        .unwrap();
    contract
}

// ─── BanCollection ──────────────────────────────────────────────────────────

#[test]
fn ban_collection_by_owner_happy() {
    let mut contract = setup_with_app_collection("banme");
    testing_env!(context(owner()).build());

    contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "banme".to_string(),
            reason: Some("spam".to_string()),
        }))
        .unwrap();

    let col = contract.collections.get("banme").unwrap();
    assert!(col.banned);
}

#[test]
fn ban_collection_by_moderator_happy() {
    let mut contract = setup_with_app_collection("banme2");
    testing_env!(context(moderator()).build());

    contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "banme2".to_string(),
            reason: None,
        }))
        .unwrap();

    let col = contract.collections.get("banme2").unwrap();
    assert!(col.banned);
}

#[test]
fn ban_collection_already_banned_fails() {
    let mut contract = setup_with_app_collection("banme3");
    testing_env!(context(owner()).build());
    contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "banme3".to_string(),
            reason: None,
        }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "banme3".to_string(),
            reason: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn ban_collection_wrong_app_fails() {
    let mut contract = setup_with_app_collection("banme4");
    testing_env!(context(owner()).build());

    let other_app: AccountId = "other.near".parse().unwrap();
    contract
        .execute(make_request(Action::RegisterApp {
            app_id: other_app.clone(),
            params: AppConfig::default(),
        }))
        .unwrap();

    let err = contract
        .execute(make_request(Action::BanCollection {
            app_id: other_app,
            collection_id: "banme4".to_string(),
            reason: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

#[test]
fn ban_collection_non_authority_fails() {
    let mut contract = setup_with_app_collection("banme5");
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "banme5".to_string(),
            reason: None,
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}

// ─── UnbanCollection ────────────────────────────────────────────────────────

#[test]
fn unban_collection_happy() {
    let mut contract = setup_with_app_collection("unban");
    testing_env!(context(owner()).build());
    contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "unban".to_string(),
            reason: None,
        }))
        .unwrap();

    contract
        .execute(make_request(Action::UnbanCollection {
            app_id: app_id(),
            collection_id: "unban".to_string(),
        }))
        .unwrap();

    let col = contract.collections.get("unban").unwrap();
    assert!(!col.banned);
}

#[test]
fn unban_collection_not_banned_fails() {
    let mut contract = setup_with_app_collection("notbanned");
    testing_env!(context(owner()).build());

    let err = contract
        .execute(make_request(Action::UnbanCollection {
            app_id: app_id(),
            collection_id: "notbanned".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidState(_)));
}

#[test]
fn unban_collection_non_authority_fails() {
    let mut contract = setup_with_app_collection("unban2");
    testing_env!(context(owner()).build());
    contract
        .execute(make_request(Action::BanCollection {
            app_id: app_id(),
            collection_id: "unban2".to_string(),
            reason: None,
        }))
        .unwrap();
    testing_env!(context(buyer()).build());

    let err = contract
        .execute(make_request(Action::UnbanCollection {
            app_id: app_id(),
            collection_id: "unban2".to_string(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::Unauthorized(_)));
}
