use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

// ── Helper: create a listed native scarce ────────────────────────────────────

fn setup_listed_scarce(contract: &mut Contract) -> (String, u128) {
    let price: u128 = 5_000_000_000_000_000_000_000_000; // 5 NEAR
    testing_env!(context(buyer()).build());
    let metadata = scarce::types::TokenMetadata {
        title: Some("Prepaid test".into()),
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
    (tid, price)
}

// ── draw_user_balance ────────────────────────────────────────────────────────

#[test]
fn draw_user_balance_full_available() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();

    // User has 10 NEAR, 0 used bytes → all available
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: 10 * byte_cost * 1000,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, 10 * byte_cost * 1000);
    assert_eq!(contract.pending_attached_balance, drawn);

    // User storage reduced to 0
    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, 0);
}

#[test]
fn draw_user_balance_reserves_storage_cost() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();
    let total = byte_cost * 100;
    let used_bytes = 30u64;
    let reserved = used_bytes as u128 * byte_cost;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: total,
            used_bytes,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, total - reserved);
    assert_eq!(contract.pending_attached_balance, drawn);

    // Reserved amount stays
    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, reserved);
}

#[test]
fn draw_user_balance_no_entry_returns_zero() {
    let mut contract = new_contract();
    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, 0);
    assert_eq!(contract.pending_attached_balance, 0);
}

#[test]
fn draw_user_balance_all_reserved_returns_zero() {
    let mut contract = new_contract();
    let byte_cost = storage::storage_byte_cost();

    // Balance exactly covers used bytes → nothing available
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: byte_cost * 50,
            used_bytes: 50,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, 0);
    assert_eq!(contract.pending_attached_balance, 0);
}

// ── restore_user_balance ─────────────────────────────────────────────────────

#[test]
fn restore_user_balance_partial_use() {
    let mut contract = new_contract();
    let drawn: u128 = 10_000;

    // Simulate: 10_000 drawn, only 6_000 used → 4_000 remaining
    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: 0,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let external_remaining = contract.restore_user_balance(&buyer(), 4_000, drawn);
    assert_eq!(external_remaining, 0); // 4_000 < 10_000 drawn → all goes to user

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, 4_000);
}

#[test]
fn restore_user_balance_exact_use() {
    let mut contract = new_contract();
    let drawn: u128 = 5_000;

    // All drawn was consumed → remaining = 0
    let external_remaining = contract.restore_user_balance(&buyer(), 0, drawn);
    assert_eq!(external_remaining, 0);
}

#[test]
fn restore_user_balance_with_external_deposit() {
    let mut contract = new_contract();
    // Edge case: remaining > drawn (shouldn't happen with current flow, but safe)
    // remaining = 15_000, drawn = 5_000 → refund 5_000, external 10_000
    let external_remaining = contract.restore_user_balance(&buyer(), 15_000, 5_000);
    assert_eq!(external_remaining, 10_000);

    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, 5_000);
}

// ── uses_prepaid_balance ─────────────────────────────────────────────────────

#[test]
fn uses_prepaid_balance_purchase_actions() {
    assert!(Action::PurchaseNativeScarce {
        token_id: "s:1".into(),
    }
    .uses_prepaid_balance());
    assert!(Action::PurchaseLazyListing {
        listing_id: "l:1".into(),
    }
    .uses_prepaid_balance());
    assert!(Action::PurchaseFromCollection {
        collection_id: "c:1".into(),
        quantity: 1,
        max_price_per_token: U128(u128::MAX),
    }
    .uses_prepaid_balance());
    assert!(Action::PlaceBid {
        token_id: "s:1".into(),
        amount: U128(100),
    }
    .uses_prepaid_balance());
    assert!(Action::MakeOffer {
        token_id: "s:1".into(),
        amount: U128(100),
        expires_at: None,
    }
    .uses_prepaid_balance());
    assert!(Action::MakeCollectionOffer {
        collection_id: "c:1".into(),
        amount: U128(100),
        expires_at: None,
    }
    .uses_prepaid_balance());
}

#[test]
fn uses_prepaid_balance_excluded_actions() {
    // StorageDeposit and FundAppPool should NOT draw from prepaid balance
    assert!(!Action::StorageDeposit { account_id: None }.uses_prepaid_balance());
    assert!(!Action::FundAppPool {
        app_id: "app.near".parse().unwrap()
    }
    .uses_prepaid_balance());
    assert!(!Action::TransferScarce {
        receiver_id: buyer(),
        token_id: "s:1".into(),
        memo: None,
    }
    .uses_prepaid_balance());
}

// ── Integration: prepaid purchase via execute() ──────────────────────────────

#[test]
fn execute_purchase_native_scarce_from_prepaid_balance() {
    let mut contract = new_contract();
    let (tid, price) = setup_listed_scarce(&mut contract);

    // Fund creator's (buyer = accounts(1)) storage with 10 NEAR
    let deposit_amount = 10_000_000_000_000_000_000_000_000u128; // 10 NEAR
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: deposit_amount,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    // Creator purchases via execute() with 0 attached deposit (relayer path)
    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    // Token transferred to creator
    let token = contract.scarces_by_id.get(&tid).unwrap();
    assert_eq!(token.owner_id, creator());

    // Sale removed
    let sale_id = Contract::make_sale_id(&"marketplace.near".parse().unwrap(), &tid);
    assert!(!contract.sales.contains_key(&sale_id));

    // User balance decreased by price (fees deducted from price, not from user)
    let user = contract.user_storage.get(&creator()).unwrap();
    let change = deposit_amount - user.balance;
    assert_eq!(change, price);
}

#[test]
fn execute_purchase_insufficient_prepaid_balance_fails() {
    let mut contract = new_contract();
    let (tid, _price) = setup_listed_scarce(&mut contract);

    // Fund creator's balance with less than price
    let small_amount = 1_000u128; // Way less than 5 NEAR
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: small_amount,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    // Purchase should fail
    testing_env!(context(creator()).build());
    let result = contract.execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
    }));
    assert!(result.is_err());

    // User balance fully restored (drawn then returned on failure)
    let user = contract.user_storage.get(&creator()).unwrap();
    assert_eq!(user.balance, small_amount);
}

#[test]
fn execute_purchase_no_prepaid_no_deposit_fails() {
    let mut contract = new_contract();
    let (tid, _price) = setup_listed_scarce(&mut contract);

    // No user balance, no attached deposit
    testing_env!(context(creator()).build());
    let result = contract.execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
    }));
    assert!(result.is_err());
}

#[test]
fn execute_purchase_with_deposit_skips_prepaid() {
    let mut contract = new_contract();
    let (tid, price) = setup_listed_scarce(&mut contract);

    // User has prepaid balance AND attaches deposit
    let prepaid = 10_000_000_000_000_000_000_000_000u128;
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: prepaid,
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    // Attach enough deposit — prepaid should NOT be touched
    testing_env!(context_with_deposit(creator(), price).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    // Prepaid balance untouched
    let user = contract.user_storage.get(&creator()).unwrap();
    assert_eq!(user.balance, prepaid);
}

#[test]
fn execute_purchase_reserves_storage_bytes() {
    let mut contract = new_contract();
    let (tid, price) = setup_listed_scarce(&mut contract);
    let byte_cost = storage::storage_byte_cost();

    // User has balance, some used by storage
    let used_bytes = 100u64;
    let reserved = used_bytes as u128 * byte_cost;
    let total = price + reserved + 1_000; // enough for price + storage reserve
    contract.user_storage.insert(
        creator(),
        UserStorageBalance {
            balance: total,
            used_bytes,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    testing_env!(context(creator()).build());
    contract
        .execute(make_request(Action::PurchaseNativeScarce {
            token_id: tid.clone(),
        }))
        .unwrap();

    // Storage reservation preserved
    let user = contract.user_storage.get(&creator()).unwrap();
    assert!(user.balance >= reserved);
    assert_eq!(user.used_bytes, used_bytes); // unchanged
}
