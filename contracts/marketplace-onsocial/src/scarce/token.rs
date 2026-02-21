//! Token-level types re-exported by the scarce module.

use crate::*;

#[near(serializers = [json])]
#[derive(Clone)]
pub struct TransferItem {
    pub receiver_id: AccountId,
    pub token_id: String,
    pub memo: Option<String>,
}
