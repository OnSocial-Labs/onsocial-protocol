use near_sdk::AccountId;

use super::STORAGE;
use super::builder::EventBuilder;

pub fn emit_storage_deposit(account_id: &AccountId, deposit: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "storage_deposit", account_id)
        .field("account_id", account_id)
        .field("deposit", deposit)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_storage_withdraw(account_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "storage_withdraw", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_storage_credit_unused(account_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "credit_unused_deposit", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_storage_refund(account_id: &AccountId, amount: u128) {
    EventBuilder::new(STORAGE, "refund_unused_deposit", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .emit();
}

pub fn emit_prepaid_balance_drawn(account_id: &AccountId, amount: u128, remaining_balance: u128) {
    EventBuilder::new(STORAGE, "prepaid_balance_drawn", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("remaining_balance", remaining_balance)
        .emit();
}

pub fn emit_prepaid_balance_restored(account_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "prepaid_balance_restored", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_spending_cap_set(account_id: &AccountId, cap: Option<u128>) {
    EventBuilder::new(STORAGE, "spending_cap_set", account_id)
        .field("account_id", account_id)
        .field_opt("cap", cap)
        .emit();
}

pub fn emit_wnear_deposit(account_id: &AccountId, amount: u128, new_balance: u128) {
    EventBuilder::new(STORAGE, "wnear_deposit", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_wnear_unwrap_failed(account_id: &AccountId, amount: u128) {
    EventBuilder::new(STORAGE, "wnear_unwrap_failed", account_id)
        .field("account_id", account_id)
        .field("amount", amount)
        .emit();
}
