use near_sdk::AccountId;

use super::builder::EventBuilder;
use super::CONTRACT;

pub fn emit_contract_upgraded(contract_id: &AccountId, old_version: &str, new_version: &str) {
    EventBuilder::new(CONTRACT, "contract_upgrade", contract_id)
        .field("old_version", old_version)
        .field("new_version", new_version)
        .emit();
}

pub fn emit_owner_transferred(old_owner: &AccountId, new_owner: &AccountId) {
    EventBuilder::new(CONTRACT, "owner_transferred", old_owner)
        .field("old_owner", old_owner)
        .field("new_owner", new_owner)
        .emit();
}

pub fn emit_fee_recipient_changed(owner_id: &AccountId, old_recipient: &AccountId, new_recipient: &AccountId) {
    EventBuilder::new(CONTRACT, "fee_recipient_changed", owner_id)
        .field("old_recipient", old_recipient)
        .field("new_recipient", new_recipient)
        .emit();
}

pub fn emit_fee_config_updated(
    owner_id: &AccountId,
    total_fee_bps: u16,
    app_pool_fee_bps: u16,
    platform_storage_fee_bps: u16,
) {
    EventBuilder::new(CONTRACT, "fee_config_updated", owner_id)
        .field("total_fee_bps", total_fee_bps as u32)
        .field("app_pool_fee_bps", app_pool_fee_bps as u32)
        .field("platform_storage_fee_bps", platform_storage_fee_bps as u32)
        .emit();
}

pub fn emit_intents_executor_added(owner_id: &AccountId, executor: &AccountId) {
    EventBuilder::new(CONTRACT, "add_intents_executor", owner_id)
        .field("executor", executor)
        .emit();
}

pub fn emit_intents_executor_removed(owner_id: &AccountId, executor: &AccountId) {
    EventBuilder::new(CONTRACT, "remove_intents_executor", owner_id)
        .field("executor", executor)
        .emit();
}

pub fn emit_contract_metadata_updated(
    owner_id: &AccountId,
    name: &str,
    symbol: &str,
    icon: Option<&str>,
    base_uri: Option<&str>,
    reference: Option<&str>,
) {
    EventBuilder::new(CONTRACT, "contract_metadata_updated", owner_id)
        .field("name", name)
        .field("symbol", symbol)
        .field_opt("icon", icon)
        .field_opt("base_uri", base_uri)
        .field_opt("reference", reference)
        .emit();
}

pub fn emit_approved_nft_contract_added(owner_id: &AccountId, contract_id: &AccountId) {
    EventBuilder::new(CONTRACT, "approved_nft_contract_added", owner_id)
        .field("contract_id", contract_id)
        .emit();
}

pub fn emit_approved_nft_contract_removed(owner_id: &AccountId, contract_id: &AccountId) {
    EventBuilder::new(CONTRACT, "approved_nft_contract_removed", owner_id)
        .field("contract_id", contract_id)
        .emit();
}

pub fn emit_wnear_account_set(owner_id: &AccountId, wnear_account_id: Option<&AccountId>) {
    EventBuilder::new(CONTRACT, "wnear_account_set", owner_id)
        .field("owner_id", owner_id)
        .field_opt("wnear_account_id", wnear_account_id)
        .emit();
}
