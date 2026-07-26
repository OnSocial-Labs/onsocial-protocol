use near_sdk::AccountId;

use super::APP_POOL;
use super::builder::EventBuilder;

#[allow(clippy::too_many_arguments)]
pub fn emit_app_pool_register(
    owner_id: &AccountId,
    app_id: &str,
    initial_balance: u128,
    primary_sale_bps: u16,
    creator_access: &str,
    curated: bool,
    metadata: Option<&str>,
) {
    EventBuilder::new(APP_POOL, "register", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .field("initial_balance", initial_balance)
        .field("primary_sale_bps", primary_sale_bps as u32)
        .field("creator_access", creator_access)
        .field("curated", curated)
        .field_opt("metadata", metadata)
        .emit();
}

pub fn emit_app_pool_fund(funder: &AccountId, app_id: &str, amount: u128, new_balance: u128) {
    EventBuilder::new(APP_POOL, "fund", funder)
        .field("funder", funder)
        .field("app_id", app_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_app_pool_withdraw(owner_id: &AccountId, app_id: &str, amount: u128, new_balance: u128) {
    EventBuilder::new(APP_POOL, "withdraw", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .field("amount", amount)
        .field("new_balance", new_balance)
        .emit();
}

pub fn emit_app_config_update(
    owner_id: &AccountId,
    app_id: &str,
    primary_sale_bps: u16,
    creator_access: &str,
    curated: bool,
    metadata: Option<&str>,
) {
    EventBuilder::new(APP_POOL, "config_update", owner_id)
        .field("owner_id", owner_id)
        .field("app_id", app_id)
        .field("primary_sale_bps", primary_sale_bps as u32)
        .field("creator_access", creator_access)
        .field("curated", curated)
        .field_opt("metadata", metadata)
        .emit();
}

pub fn emit_app_owner_transferred(old_owner: &AccountId, new_owner: &AccountId, app_id: &str) {
    EventBuilder::new(APP_POOL, "owner_transferred", old_owner)
        .field("app_id", app_id)
        .field("old_owner", old_owner)
        .field("new_owner", new_owner)
        .emit();
}

pub fn emit_moderator_added(owner_id: &AccountId, app_id: &str, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "moderator_added", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_moderator_removed(owner_id: &AccountId, app_id: &str, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "moderator_removed", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_approved_creator_added(owner_id: &AccountId, app_id: &str, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "approved_creator_added", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_approved_creator_removed(owner_id: &AccountId, app_id: &str, account_id: &AccountId) {
    EventBuilder::new(APP_POOL, "approved_creator_removed", owner_id)
        .field("app_id", app_id)
        .field("account_id", account_id)
        .emit();
}
