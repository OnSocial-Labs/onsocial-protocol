//! Offer system: token offers, collection floor offers, NEAR escrow.

pub mod types;
mod collection;
mod token;

pub use types::*;

use near_sdk::AccountId;

pub(crate) fn offer_key(token_id: &str, buyer_id: &AccountId) -> String {
    format!("{}\0{}", token_id, buyer_id)
}

pub(crate) fn collection_offer_key(collection_id: &str, buyer_id: &AccountId) -> String {
    format!("{}\0{}", collection_id, buyer_id)
}
