use crate::tests::test_utils::*;
use crate::*;
use near_sdk::json_types::U128;
use near_sdk::testing_env;

fn wnear() -> AccountId {
    "wrap.near".parse().unwrap()
}

fn setup_wnear_contract() -> Contract {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_wnear_account(Some(wnear())).unwrap();
    contract
}

#[test]
fn admin_set_wnear_account() {
    let mut contract = new_contract();
    assert!(contract.wnear_account_id.is_none());

    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_wnear_account(Some(wnear())).unwrap();
    assert_eq!(contract.wnear_account_id, Some(wnear()));
}

#[test]
fn admin_clear_wnear_account() {
    let mut contract = setup_wnear_contract();
    assert!(contract.wnear_account_id.is_some());

    testing_env!(context_with_deposit(owner(), 1).build());
    contract.set_wnear_account(None).unwrap();
    assert!(contract.wnear_account_id.is_none());
}

#[test]
fn admin_set_wnear_non_owner_rejected() {
    let mut contract = new_contract();
    testing_env!(context_with_deposit(buyer(), 1).build());
    let result = contract.set_wnear_account(Some(wnear()));
    assert!(result.is_err());
}

#[test]
fn admin_set_wnear_requires_one_yocto() {
    let mut contract = new_contract();
    testing_env!(context(owner()).build());
    let result = contract.set_wnear_account(Some(wnear()));
    assert!(result.is_err());
}

fn context_callback_success(predecessor: AccountId) -> near_sdk::test_utils::VMContextBuilder {
    let mut builder = context(predecessor);
    builder.predecessor_account_id("marketplace.near".parse().unwrap());
    builder
}

#[test]
fn on_wnear_unwrapped_credits_balance_on_success() {
    let mut contract = setup_wnear_contract();
    let amount = 5_000_000_000_000_000_000_000_000u128;

    let ctx = context_callback_success(owner());
    testing_env!(ctx.build());

    let mut user = contract
        .user_storage
        .get(&buyer())
        .cloned()
        .unwrap_or_default();
    user.balance.0 += amount;
    let new_balance = user.balance;
    contract.user_storage.insert(buyer(), user);

    assert_eq!(new_balance, U128(amount));
    let stored = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(stored.balance, U128(amount));
}

#[test]
fn on_wnear_unwrapped_returns_refund_on_failure() {
    let mut contract = setup_wnear_contract();
    let amount = 5_000_000_000_000_000_000_000_000u128;

    testing_env!(context("marketplace.near".parse::<AccountId>().unwrap()).build());
    let refund = contract.on_wnear_unwrapped(buyer(), U128(amount));

    assert_eq!(refund.0, amount);

    let user = contract.user_storage.get(&buyer());
    assert!(user.is_none() || user.unwrap().balance == U128(0));
}

#[test]
fn on_wnear_unwrapped_creates_new_user_storage_entry() {
    let mut contract = setup_wnear_contract();
    let amount = 1_000_000_000_000_000_000_000_000u128;

    assert!(contract.user_storage.get(&buyer()).is_none());

    let mut user = contract
        .user_storage
        .get(&buyer())
        .cloned()
        .unwrap_or_default();
    user.balance.0 += amount;
    contract.user_storage.insert(buyer(), user);

    let stored = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(stored.balance, U128(amount));
    assert_eq!(stored.used_bytes, 0);
    assert_eq!(stored.tier2_used_bytes, 0);
    assert_eq!(stored.spending_cap, None);
}

#[test]
fn on_wnear_unwrapped_adds_to_existing_balance() {
    let mut contract = setup_wnear_contract();
    let existing = 2_000_000_000_000_000_000_000_000u128;
    let deposit = 3_000_000_000_000_000_000_000_000u128;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(existing),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    let mut user = contract.user_storage.get(&buyer()).cloned().unwrap();
    user.balance.0 += deposit;
    contract.user_storage.insert(buyer(), user);

    let stored = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(stored.balance, U128(existing + deposit));
}

#[test]
fn wnear_deposit_enables_prepaid_purchase() {
    let mut contract = setup_wnear_contract();
    let price = 5_000u128;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(price * 2),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: None,
        },
    );

    testing_env!(context(creator()).build());
    let metadata = scarce::types::TokenMetadata {
        title: Some("wNEAR test scarce".into()),
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
    let token_id = contract.quick_mint(&creator(), metadata, options).unwrap();
    contract
        .list_native_scarce(&creator(), &token_id, U128(price), None)
        .unwrap();

    testing_env!(context(buyer()).build());
    contract.pending_attached_balance = 0;

    let drawn = contract.draw_user_balance(&buyer());
    assert_eq!(drawn, price * 2);
    assert_eq!(contract.pending_attached_balance, price * 2);

    contract
        .purchase_native_scarce(&buyer(), token_id.clone(), price * 2)
        .unwrap();

    let scarce = contract.scarces_by_id.get(&token_id).unwrap();
    assert_eq!(scarce.owner_id, buyer());
}

#[test]
fn wnear_deposit_respects_spending_cap() {
    let mut contract = setup_wnear_contract();
    let deposit = 10_000u128;
    let cap = 3_000u128;

    contract.user_storage.insert(
        buyer(),
        UserStorageBalance {
            balance: U128(deposit),
            used_bytes: 0,
            tier2_used_bytes: 0,
            spending_cap: Some(U128(cap)),
        },
    );

    testing_env!(context(buyer()).build());
    contract.pending_attached_balance = 0;
    let drawn = contract.draw_user_balance(&buyer());

    assert_eq!(drawn, cap);
    assert_eq!(contract.pending_attached_balance, cap);
    let user = contract.user_storage.get(&buyer()).unwrap();
    assert_eq!(user.balance, U128(deposit - cap));
}

#[test]
fn wnear_deposit_credits_different_account_via_msg() {
    let contract = setup_wnear_contract();

    let alice: AccountId = "alice.near".parse().unwrap();
    assert!(contract.user_storage.get(&alice).is_none());

    let mut contract = contract;
    let amount = 1_000_000u128;
    let mut user = contract
        .user_storage
        .get(&alice)
        .cloned()
        .unwrap_or_default();
    user.balance.0 += amount;
    contract.user_storage.insert(alice.clone(), user);

    let stored = contract.user_storage.get(&alice).unwrap();
    assert_eq!(stored.balance, U128(amount));
}
