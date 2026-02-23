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

fn app_id() -> AccountId {
    "app.near".parse().unwrap()
}

fn make_lazy_listing_params(price: u128) -> LazyListing {
    LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("Lazy".into()),
            description: None,
            media: None,
            media_hash: None,
            copies: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        price: U128(price),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        expires_at: None,
    }
}

fn create_listing(contract: &mut Contract) -> String {
    testing_env!(context(creator()).build());
    let action = Action::CreateLazyListing {
        params: make_lazy_listing_params(5_000),
    };
    contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

fn create_listing_with_app(contract: &mut Contract) -> String {
    testing_env!(context(creator()).build());
    let params = LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("AppLazy".into()),
            description: None,
            media: None,
            media_hash: None,
            copies: None,
            issued_at: None,
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        },
        price: U128(3_000),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: Some(app_id()),
            transferable: true,
            burnable: true,
        },
        expires_at: None,
    };
    let action = Action::CreateLazyListing { params };
    contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

// --- get_lazy_listing ---

#[test]
fn get_lazy_listing_returns_created() {
    let mut contract = setup_contract();
    let id = create_listing(&mut contract);

    testing_env!(context(owner()).build());
    let listing = contract.get_lazy_listing(id).unwrap();
    assert_eq!(listing.price, U128(5_000));
    assert_eq!(listing.creator_id, creator());
}

#[test]
fn get_lazy_listing_none_for_missing() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract.get_lazy_listing("bad".into()).is_none());
}

// --- get_lazy_listings_by_creator ---

#[test]
fn get_lazy_listings_by_creator_empty() {
    let contract = setup_contract();
    testing_env!(context(owner()).build());
    assert!(contract
        .get_lazy_listings_by_creator(buyer(), None, None)
        .is_empty());
}

#[test]
fn get_lazy_listings_by_creator_returns_owned() {
    let mut contract = setup_contract();
    let id1 = create_listing(&mut contract);
    let id2 = create_listing(&mut contract);

    testing_env!(context(owner()).build());
    let listings = contract.get_lazy_listings_by_creator(creator(), None, None);
    assert_eq!(listings.len(), 2);
    let ids: Vec<_> = listings.iter().map(|(id, _)| id.as_str()).collect();
    assert!(ids.contains(&id1.as_str()));
    assert!(ids.contains(&id2.as_str()));
}

// --- get_lazy_listings_by_app ---

#[test]
fn get_lazy_listings_by_app_filters() {
    let mut contract = setup_contract();
    // Register the app first
    testing_env!(context(owner()).build());
    let register_action = Action::RegisterApp {
        app_id: app_id(),
        params: AppConfig {
            max_user_bytes: Some(100_000),
            default_royalty: None,
            primary_sale_bps: None,
            curated: None,
            metadata: None,
        },
    };
    contract.execute(make_request(register_action)).unwrap();

    create_listing(&mut contract); // no app
    create_listing_with_app(&mut contract); // with app

    testing_env!(context(owner()).build());
    let by_app = contract.get_lazy_listings_by_app(app_id(), None, None);
    assert_eq!(by_app.len(), 1);
    assert_eq!(by_app[0].1.app_id, Some(app_id()));
}

// --- get_lazy_listings_count ---

#[test]
fn get_lazy_listings_count_tracks() {
    let mut contract = setup_contract();
    assert_eq!(contract.get_lazy_listings_count(), 0);

    create_listing(&mut contract);
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_lazy_listings_count(), 1);

    create_listing(&mut contract);
    testing_env!(context(owner()).build());
    assert_eq!(contract.get_lazy_listings_count(), 2);
}

// --- pagination ---

#[test]
fn get_lazy_listings_by_creator_pagination() {
    let mut contract = setup_contract();
    for _ in 0..5 {
        create_listing(&mut contract);
    }
    testing_env!(context(owner()).build());

    let page1 = contract.get_lazy_listings_by_creator(creator(), None, Some(2));
    assert_eq!(page1.len(), 2);

    let page2 = contract.get_lazy_listings_by_creator(creator(), Some(2), Some(10));
    assert_eq!(page2.len(), 3);
}
