use near_sdk::AccountId;

use super::builder::EventBuilder;
use super::STORAGE;

// --- STORAGE_UPDATE ---

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
