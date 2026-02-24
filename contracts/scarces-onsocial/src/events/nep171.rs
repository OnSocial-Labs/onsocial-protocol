use super::builder::Nep171Event;

const VERSION: &str = "1.2.0";

pub fn emit_mint(owner_id: &str, token_ids: &[String], memo: Option<&str>) {
    Nep171Event::new("nft_mint", VERSION)
        .field("owner_id", owner_id)
        .field("token_ids", token_ids)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_transfer(
    old_owner_id: &str,
    new_owner_id: &str,
    token_ids: &[&str],
    authorized_id: Option<&str>,
    memo: Option<&str>,
) {
    Nep171Event::new("nft_transfer", VERSION)
        .field("old_owner_id", old_owner_id)
        .field("new_owner_id", new_owner_id)
        .field("token_ids", token_ids)
        .field_opt("authorized_id", authorized_id)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_burn(
    owner_id: &str,
    token_ids: &[&str],
    authorized_id: Option<&str>,
    memo: Option<&str>,
) {
    Nep171Event::new("nft_burn", VERSION)
        .field("owner_id", owner_id)
        .field("token_ids", token_ids)
        .field_opt("authorized_id", authorized_id)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_metadata_update(token_ids: &[&str]) {
    Nep171Event::new("nft_metadata_update", VERSION)
        .field("token_ids", token_ids)
        .emit();
}

// Interop invariant: emit NEP-171 envelope without custom fields.
pub fn emit_contract_metadata_update() {
    Nep171Event::new("contract_metadata_update", VERSION).emit();
}
