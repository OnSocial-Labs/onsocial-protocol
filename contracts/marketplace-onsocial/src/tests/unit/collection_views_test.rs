use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// --- Helpers ---

fn setup_contract() -> Contract {
    let mut contract = new_contract();
    contract.platform_storage_balance = 10_000_000_000_000_000_000_000_000;
    contract
}

fn default_options() -> scarce::types::ScarceOptions {
    scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    }
}

fn minimal_config(id: &str) -> CollectionConfig {
    CollectionConfig {
        collection_id: id.to_string(),
        total_supply: 10,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(1_000),
        start_time: None,
        end_time: None,
        options: default_options(),
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: Some(3),
        start_price: None,
        allowlist_price: None,
    }
}

fn create_collection(contract: &mut Contract, id: &str) {
    testing_env!(context(creator()).build());
    contract
        .internal_create_collection(&creator(), minimal_config(id))
        .unwrap();
}

// --- get_collection ---

#[test]
fn get_collection_returns_created() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc1");

    testing_env!(context(owner()).build());
    let col = contract.get_collection("vc1".into()).unwrap();
    assert_eq!(col.total_supply, 10);
    assert_eq!(col.creator_id, creator());
}

#[test]
fn get_collection_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_collection("nope".into()).is_none());
}

// --- get_collection_availability ---

#[test]
fn get_collection_availability_full() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc2");

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_collection_availability("vc2".into()), 10);
}

#[test]
fn get_collection_availability_after_mint() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc3");

    testing_env!(context(creator()).build());
    let action = Action::MintFromCollection {
        collection_id: "vc3".into(),
        quantity: 3,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();

    assert_eq!(contract.get_collection_availability("vc3".into()), 7);
}

#[test]
fn get_collection_availability_missing_returns_zero() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_collection_availability("nope".into()), 0);
}

// --- is_collection_sold_out ---

#[test]
fn is_collection_sold_out_false_initially() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc4");
    testing_env!(context(owner()).build());
    assert!(!contract.is_collection_sold_out("vc4".into()));
}

#[test]
fn is_collection_sold_out_true_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.is_collection_sold_out("nope".into()));
}

// --- is_collection_mintable ---

#[test]
fn is_collection_mintable_true_for_active() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc5");
    testing_env!(context(owner()).build());
    assert!(contract.is_collection_mintable("vc5".into()));
}

#[test]
fn is_collection_mintable_false_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(!contract.is_collection_mintable("nope".into()));
}

// --- get_collection_progress ---

#[test]
fn get_collection_progress_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_collection_progress("nope".into()).is_none());
}

#[test]
fn get_collection_progress_values() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc6");

    testing_env!(context(creator()).build());
    let action = Action::MintFromCollection {
        collection_id: "vc6".into(),
        quantity: 3,
        receiver_id: None,
    };
    contract.execute(make_request(action)).unwrap();

    let progress = contract.get_collection_progress("vc6".into()).unwrap();
    assert_eq!(progress.minted, 3);
    assert_eq!(progress.total, 10);
    assert_eq!(progress.remaining, 7);
    assert_eq!(progress.percentage, 30);
}

// --- get_collections_by_creator ---

#[test]
fn get_collections_by_creator_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract
        .get_collections_by_creator(buyer(), None, None)
        .is_empty());
}

#[test]
fn get_collections_by_creator_returns() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc7a");
    create_collection(&mut contract, "vc7b");

    testing_env!(context(owner()).build());
    let cols = contract.get_collections_by_creator(creator(), None, None);
    assert_eq!(cols.len(), 2);
}

// --- get_collections_count_by_creator ---

#[test]
fn get_collections_count_by_creator_tracks() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vc8a");
    create_collection(&mut contract, "vc8b");

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_collections_count_by_creator(creator()), 2);
    assert_eq!(contract.get_collections_count_by_creator(buyer()), 0);
}

// --- get_total_collections ---

#[test]
fn get_total_collections_tracks() {
    let mut contract = setup_contract();
    assert_eq!(contract.get_total_collections(), 0);
    create_collection(&mut contract, "vc9");
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_total_collections(), 1);
}

// --- get_all_collections ---

#[test]
fn get_all_collections_pagination() {
    let mut contract = setup_contract();
    for i in 0..5 {
        create_collection(&mut contract, &format!("vcp{}", i));
    }
    testing_env!(context(owner()).build());

    let page1 = contract.get_all_collections(None, Some(2));
    assert_eq!(page1.len(), 2);

    let all = contract.get_all_collections(None, None);
    assert_eq!(all.len(), 5);
}

// --- get_active_collections ---

#[test]
fn get_active_collections_excludes_paused() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vca1");
    create_collection(&mut contract, "vca2");

    // Pause vca1 via execute
    testing_env!(context(creator()).build());
    let action = Action::PauseCollection {
        collection_id: "vca1".into(),
    };
    contract.execute(make_request(action)).unwrap();

    testing_env!(context(owner()).build());
    let active = contract.get_active_collections(None, None);
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].collection_id, "vca2");
}

// --- get_collection_stats ---

#[test]
fn get_collection_stats_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_collection_stats("nope".into()).is_none());
}

#[test]
fn get_collection_stats_returns_data() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcs1");

    testing_env!(context(owner()).build());
    let stats = contract.get_collection_stats("vcs1".into()).unwrap();
    assert_eq!(stats.total_supply, 10);
    assert_eq!(stats.minted_count, 0);
    assert_eq!(stats.remaining, 10);
    assert!(stats.is_active);
    assert!(!stats.is_sold_out);
}

// --- get_wallet_mint_count / get_wallet_mint_remaining ---

#[test]
fn get_wallet_mint_count_zero_initially() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcw1");
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_wallet_mint_count("vcw1".into(), buyer()), 0);
}

#[test]
fn get_wallet_mint_remaining_tracks() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcw2"); // max_per_wallet = 3

    testing_env!(context_with_deposit(buyer(), 1_000).build());
    let action = Action::PurchaseFromCollection {
        collection_id: "vcw2".into(),
        quantity: 1,
        max_price_per_token: None,
    };
    contract.execute(make_request(action)).unwrap();

    testing_env!(context(owner()).build());
    assert_eq!(contract.get_wallet_mint_count("vcw2".into(), buyer()), 1);
    assert_eq!(
        contract.get_wallet_mint_remaining("vcw2".into(), buyer()),
        Some(2)
    );
}

// --- allowlist views ---

#[test]
fn allowlist_views_default() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcal1");

    testing_env!(context(owner()).build());
    assert_eq!(
        contract.get_allowlist_allocation("vcal1".into(), buyer()),
        0
    );
    assert!(!contract.is_allowlisted("vcal1".into(), buyer()));
    assert_eq!(
        contract.get_allowlist_remaining("vcal1".into(), buyer()),
        0
    );
}

#[test]
fn allowlist_views_after_set() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcal2");

    // Set allowlist via execute
    testing_env!(context(creator()).build());
    let entries = vec![AllowlistEntry {
        account_id: buyer(),
        allocation: 5,
    }];
    let action = Action::SetAllowlist {
        collection_id: "vcal2".into(),
        entries,
    };
    contract.execute(make_request(action)).unwrap();

    testing_env!(context(owner()).build());
    assert_eq!(
        contract.get_allowlist_allocation("vcal2".into(), buyer()),
        5
    );
    assert!(contract.is_allowlisted("vcal2".into(), buyer()));
    assert_eq!(
        contract.get_allowlist_remaining("vcal2".into(), buyer()),
        5
    );
}

// --- get_collection_price ---

#[test]
fn get_collection_price_returns_price() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcp1");

    testing_env!(context(owner()).build());
    let price = contract.get_collection_price("vcp1".into()).unwrap();
    assert_eq!(price.0, 1_000);
}

#[test]
fn get_collection_price_not_found() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let err = contract.get_collection_price("nope".into()).unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}

// --- calculate_collection_purchase_price ---

#[test]
fn calculate_purchase_price_multiply() {
    let mut contract = setup_contract();
    create_collection(&mut contract, "vcpp1");

    testing_env!(context(owner()).build());
    let total = contract
        .calculate_collection_purchase_price("vcpp1".into(), 3)
        .unwrap();
    assert_eq!(total.0, 3_000);
}

#[test]
fn calculate_purchase_price_not_found() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    let err = contract
        .calculate_collection_purchase_price("nope".into(), 1)
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::NotFound(_)));
}
