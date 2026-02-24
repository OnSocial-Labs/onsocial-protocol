//! Tests for spending protection:
//!   Layer 1 — `max_price_per_token` on PurchaseFromCollection (Dutch auction slippage guard)
//!   Layer 2 — `spending_cap` on UserStorageBalance (per-draw cap for prepaid balance)

use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// ── Helpers ──────────────────────────────────────────────────────────────────

fn setup_listed_scarce(contract: &mut Contract, price: u128) -> String {
    testing_env!(context(buyer()).build());
    let metadata = scarce::types::TokenMetadata {
        title: Some("Spend test".into()),
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
    };
    let options = scarce::types::ScarceOptions {
        royalty: None,
        app_id: None,
        transferable: true,
        burnable: true,
    };
    let tid = contract.quick_mint(&buyer(), metadata, options).unwrap();
    contract
        .list_native_scarce(&buyer(), &tid, U128(price), None)
        .unwrap();
    tid
}

#[allow(dead_code)]
fn setup_lazy_listing(contract: &mut Contract, price: u128) -> String {
    testing_env!(context(creator()).build());
    let params = LazyListing {
        metadata: scarce::types::TokenMetadata {
            title: Some("Lazy spend test".into()),
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
    };
    contract.create_lazy_listing(&creator(), params).unwrap()
}

fn setup_collection(contract: &mut Contract, price: u128) -> String {
    let config = CollectionConfig {
        collection_id: "spcol".to_string(),
        total_supply: 100,
        metadata_template: r#"{"title":"T"}"#.to_string(),
        price_near: U128(price),
        start_time: None,
        end_time: None,
        options: scarce::types::ScarceOptions {
            royalty: None,
            app_id: None,
            transferable: true,
            burnable: true,
        },
        renewable: false,
        revocation_mode: RevocationMode::None,
        max_redeems: None,
        mint_mode: MintMode::Open,
        metadata: None,
        max_per_wallet: None,
        start_price: None,
        allowlist_price: None,
    };
    testing_env!(context(creator()).build());
    contract.create_collection(&creator(), config).unwrap();
    "spcol".to_string()
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 1: max_price_per_token on PurchaseFromCollection (Dutch auction guard)
// ═══════════════════════════════════════════════════════════════════════════════

#[test]
fn max_price_collection_allows_at_price() {
    let mut contract = new_contract();
    let price = 1_000u128;
    let col = setup_collection(&mut contract, price);

    testing_env!(context_with_deposit(buyer(), 100_000).build());
    contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col.clone(),
            quantity: 1,
            max_price_per_token: U128(price),
        }))
        .unwrap();

    let collection = contract.collections.get(&col).unwrap();
    assert_eq!(collection.minted_count, 1);
}

#[test]
fn max_price_collection_rejects_over_price() {
    let mut contract = new_contract();
    let price = 1_000u128;
    let col = setup_collection(&mut contract, price);

    testing_env!(context_with_deposit(buyer(), 100_000).build());
    let err = contract
        .execute(make_request(Action::PurchaseFromCollection {
            collection_id: col,
            quantity: 1,
            max_price_per_token: U128(price - 1),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InvalidInput(_)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Layer 2: spending_cap on prepaid balance
// ═══════════════════════════════════════════════════════════════════════════════

// --- SetSpendingCap action ---

#[test]
fn set_spending_cap_via_execute() {
    let mut contract = new_contract();

    // Deposit some balance first
    testing_env!(context_with_deposit(buyer(), 100_000).build());
    contract
        .execute(make_request(Action::StorageDeposit { account_id: None }))
        .unwrap();

    // Set cap (requires 1 yocto confirmation for Direct auth)
    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .execute(make_request(Action::SetSpendingCap {
            cap: Some(U128(5_000)),
        }))
        .unwrap();

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.spending_cap, Some(U128(5_000)));
}

#[test]
fn clear_spending_cap_via_execute() {
    let mut contract = new_contract();

    // Set a cap directly
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(100_000),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(5_000)),
        },
    );

    // Clear it (pass null)
    testing_env!(context_with_deposit(buyer(), 1).build());
    contract
        .execute(make_request(Action::SetSpendingCap { cap: None }))
        .unwrap();

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.spending_cap, None);
}

// --- draw_user_balance respects spending_cap ---

#[test]
fn draw_user_balance_capped() {
    let mut contract = new_contract();
    let balance = 100_000u128;
    let cap = 20_000u128;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(balance),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(cap)),
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, cap); // capped at 20_000, not 100_000
    assert_eq!(contract.pending_attached_balance, cap);

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, U128(balance - cap));
}

#[test]
fn draw_user_balance_cap_exceeds_available() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    let balance = byte_cost * 50 + 3_000; // 3_000 available after storage reservation
    let cap = 100_000u128; // cap higher than available

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(balance),
            used_bytes: 50,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(cap)),
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, 3_000); // limited by available, not cap
}

#[test]
fn draw_user_balance_no_cap_draws_all() {
    let mut contract = new_contract();
    let balance = 100_000u128;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(balance),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, balance); // no cap → draws everything available
}

// --- Integration: spending_cap + prepaid purchase ---

#[test]
fn spending_cap_allows_purchase_within_cap() {
    let mut contract = new_contract();
    let price = 5_000u128;
    let tid = setup_listed_scarce(&mut contract, price);

    // Fund with more than enough, cap at exactly the price
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: U128(100_000),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(price)),
        },
    );

    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());
}

#[test]
fn spending_cap_blocks_purchase_exceeding_cap() {
    let mut contract = new_contract();
    let price = 5_000u128;
    let tid = setup_listed_scarce(&mut contract, price);

    // Fund with plenty, but cap below price
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: U128(100_000),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(price - 1)),
        },
    );

    testing_env!(context(creator()).build());
    let err = contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));

    // Balance fully restored (drawn cap amount, then restored)
    let user = contract.user_storage.get(&creator()).unwrap();
    assert_eq!(user.balance, U128(100_000));
}

#[test]
fn spending_cap_does_not_affect_direct_deposit() {
    let mut contract = new_contract();
    let price = 5_000u128;
    let tid = setup_listed_scarce(&mut contract, price);

    // User has a very low cap, but attaches deposit directly → should work
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: U128(100_000),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(1)), // Extremely low cap
        },
    );

    // Direct deposit bypasses spending_cap (cap only applies to draw_user_balance)
    testing_env!(context_with_deposit(creator(), 10_000).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());

    // Prepaid balance untouched; excess deposit (10_000 - 5_000) credited back
    let user = contract.user_storage.get(&creator()).unwrap();
    assert_eq!(user.balance, U128(100_000 + (10_000 - price)));
}

// --- Spending cap with fixed-price purchase ---

#[test]
fn spending_cap_with_exact_price_succeeds() {
    let mut contract = new_contract();
    let price = 5_000u128;
    let tid = setup_listed_scarce(&mut contract, price);

    // cap exactly covers price → succeeds
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: U128(100_000),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(price)),
        },
    );

    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());
}

#[test]
fn set_spending_cap_requires_confirmation_for_direct_auth() {
    let mut contract = new_contract();

    // No deposit → should fail (requires 1 yocto confirmation)
    testing_env!(context(buyer()).build());
    let err = contract
        .execute(make_request(Action::SetSpendingCap {
            cap: Some(U128(1_000)),
        }))
        .unwrap_err();
    assert!(matches!(err, MarketplaceError::InsufficientDeposit(_)));
}
