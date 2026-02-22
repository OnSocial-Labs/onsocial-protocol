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

fn create_listing_with_expiry(contract: &mut Contract, expires_at: Option<u64>) -> String {
    testing_env!(context(creator()).build());
    let params = LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("Expirable".into()),
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
        price: U128(1_000),
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        expires_at,
    };
    let action = Action::CreateLazyListing { params };
    contract
        .execute(make_request(action))
        .unwrap()
        .as_str()
        .unwrap()
        .to_string()
}

// --- cleanup_expired_lazy_listings ---

#[test]
fn cleanup_no_expired_returns_zero() {
    let mut contract = setup_contract();
    // Create listing with no expiry (never expires)
    create_listing_with_expiry(&mut contract, None);

    testing_env!(context(owner()).build());
    let cleaned = contract.cleanup_expired_lazy_listings(None);
    assert_eq!(cleaned, 0);
}

#[test]
fn cleanup_removes_expired() {
    let mut contract = setup_contract();
    // Create listing with expiry slightly in the future
    let soon = 1_700_000_001_000_000_000; // 1 second after default block_timestamp
    let id = create_listing_with_expiry(&mut contract, Some(soon));

    // Advance time past the expiry
    let mut ctx = context(owner());
    ctx.block_timestamp(1_700_000_010_000_000_000);
    testing_env!(ctx.build());
    assert!(contract.get_lazy_listing(id.clone()).is_some());

    let cleaned = contract.cleanup_expired_lazy_listings(None);
    assert_eq!(cleaned, 1);
    assert!(contract.get_lazy_listing(id).is_none());
}

#[test]
fn cleanup_respects_limit() {
    let mut contract = setup_contract();
    let soon = 1_700_000_001_000_000_000;
    for _ in 0..5 {
        create_listing_with_expiry(&mut contract, Some(soon));
    }

    // Advance time past the expiry
    let mut ctx = context(owner());
    ctx.block_timestamp(1_700_000_010_000_000_000);
    testing_env!(ctx.build());
    assert_eq!(contract.get_lazy_listings_count(), 5);

    let cleaned = contract.cleanup_expired_lazy_listings(Some(2));
    assert_eq!(cleaned, 2);
    assert_eq!(contract.get_lazy_listings_count(), 3);
}

#[test]
fn cleanup_skips_non_expired() {
    let mut contract = setup_contract();
    let soon = 1_700_000_001_000_000_000;
    let far_future = 1_800_000_000_000_000_000;
    create_listing_with_expiry(&mut contract, Some(soon));
    let non_expired_id = create_listing_with_expiry(&mut contract, Some(far_future));
    create_listing_with_expiry(&mut contract, None);

    // Advance time past `soon` but before `far_future`
    let mut ctx = context(owner());
    ctx.block_timestamp(1_700_000_010_000_000_000);
    testing_env!(ctx.build());
    let cleaned = contract.cleanup_expired_lazy_listings(None);
    assert_eq!(cleaned, 1);
    assert!(contract.get_lazy_listing(non_expired_id).is_some());
    assert_eq!(contract.get_lazy_listings_count(), 2);
}
