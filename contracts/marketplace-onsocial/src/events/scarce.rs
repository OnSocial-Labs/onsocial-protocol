use near_sdk::json_types::U128;
use near_sdk::serde_json::{Map, Value};
use near_sdk::{env, AccountId};

use super::builder::EventBuilder;
use super::SCARCE;

// --- SCARCE_UPDATE ---

pub fn emit_scarce_list(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
    prices: Vec<U128>,
) {
    let prices_arr = Value::Array(
        prices
            .into_iter()
            .map(|p| Value::String(p.0.to_string()))
            .collect(),
    );
    EventBuilder::new(SCARCE, "list", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_ids", token_ids)
        .field("prices", prices_arr)
        .emit();
}

pub fn emit_scarce_delist(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_ids: Vec<String>,
) {
    EventBuilder::new(SCARCE, "delist", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_ids", token_ids)
        .emit();
}

pub fn emit_scarce_update_price(
    owner_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    old_price: U128,
    new_price: U128,
) {
    EventBuilder::new(SCARCE, "update_price", owner_id)
        .field("owner_id", owner_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("old_price", old_price)
        .field("new_price", new_price)
        .emit();
}

pub fn emit_scarce_purchase(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    price: U128,
    marketplace_fee: u128,
    app_pool_amount: u128,
) {
    EventBuilder::new(SCARCE, "purchase", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("price", price)
        .field("marketplace_fee", marketplace_fee)
        .field("app_pool_amount", app_pool_amount)
        .emit();
}

pub fn emit_scarce_purchase_failed(
    buyer_id: &AccountId,
    seller_id: &AccountId,
    scarce_contract_id: &AccountId,
    token_id: &str,
    attempted_price: U128,
    reason: &str,
) {
    EventBuilder::new(SCARCE, "purchase_failed", buyer_id)
        .field("buyer_id", buyer_id)
        .field("seller_id", seller_id)
        .field("scarce_contract_id", scarce_contract_id)
        .field("token_id", token_id)
        .field("attempted_price", attempted_price)
        .field("reason", reason)
        .emit();
}

pub fn emit_scarce_transfer(
    sender_id: &AccountId,
    old_owner_id: &AccountId,
    receiver_id: &AccountId,
    token_id: &str,
    memo: Option<&str>,
) {
    EventBuilder::new(SCARCE, "transfer", sender_id)
        .field("sender_id", sender_id)
        .field("old_owner_id", old_owner_id)
        .field("receiver_id", receiver_id)
        .field("token_id", token_id)
        .field_opt("memo", memo)
        .emit();
    let mut nep171_data = Map::new();
    nep171_data.insert("old_owner_id".to_string(), Value::String(old_owner_id.to_string()));
    nep171_data.insert("new_owner_id".to_string(), Value::String(receiver_id.to_string()));
    nep171_data.insert("token_ids".to_string(), Value::Array(vec![Value::String(token_id.to_string())]));
    if sender_id != old_owner_id {
        nep171_data.insert("authorized_id".to_string(), Value::String(sender_id.to_string()));
    }
    if let Some(m) = memo {
        nep171_data.insert("memo".to_string(), Value::String(m.to_string()));
    }
    let mut nep171_evt = Map::new();
    nep171_evt.insert("standard".to_string(), Value::String("nep171".to_string()));
    nep171_evt.insert("version".to_string(), Value::String("1.1.0".to_string()));
    nep171_evt.insert("event".to_string(), Value::String("nft_transfer".to_string()));
    nep171_evt.insert("data".to_string(), Value::Array(vec![Value::Object(nep171_data)]));
    env::log_str(&format!("EVENT_JSON:{}", Value::Object(nep171_evt)));
}

pub fn emit_native_scarce_listed(owner_id: &AccountId, token_id: &str, price: U128) {
    EventBuilder::new(SCARCE, "list_native", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("price", price)
        .emit();
}

pub fn emit_native_scarce_delisted(owner_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "delist_native", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .emit();
}

pub fn emit_auto_delisted(token_id: &str, owner_id: &AccountId, reason: &str) {
    EventBuilder::new(SCARCE, "auto_delist", owner_id)
        .field("token_id", token_id)
        .field("owner_id", owner_id)
        .field("reason", reason)
        .emit();
}

// --- SCARCE_UPDATE — lifecycle ---

pub fn emit_token_renewed(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    new_expires_at: u64,
) {
    EventBuilder::new(SCARCE, "renew", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("new_expires_at", new_expires_at)
        .emit();
}

pub fn emit_token_revoked(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    mode: &str,
    memo: Option<&str>,
) {
    EventBuilder::new(SCARCE, "revoke", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("mode", mode)
        .field_opt("memo", memo)
        .emit();
}

pub fn emit_token_redeemed(
    actor_id: &AccountId,
    token_id: &str,
    collection_id: &str,
    owner_id: &AccountId,
    redeem_count: u32,
    max_redeems: u32,
) {
    EventBuilder::new(SCARCE, "redeem", actor_id)
        .field("token_id", token_id)
        .field("collection_id", collection_id)
        .field("owner_id", owner_id)
        .field("redeem_count", redeem_count)
        .field("max_redeems", max_redeems)
        .emit();
}

pub fn emit_scarce_burned(owner_id: &AccountId, token_id: &str, collection_id: Option<&str>) {
    EventBuilder::new(SCARCE, "burn", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field_opt("collection_id", collection_id)
        .emit();
}

// --- SCARCE_UPDATE — approvals ---

pub fn emit_approval_granted(
    owner_id: &AccountId,
    token_id: &str,
    account_id: &AccountId,
    approval_id: u64,
) {
    EventBuilder::new(SCARCE, "approval_granted", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("account_id", account_id)
        .field("approval_id", approval_id)
        .emit();
}

pub fn emit_approval_revoked(owner_id: &AccountId, token_id: &str, account_id: &AccountId) {
    EventBuilder::new(SCARCE, "approval_revoked", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("account_id", account_id)
        .emit();
}

pub fn emit_all_approvals_revoked(owner_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "all_approvals_revoked", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .emit();
}

// --- SCARCE_UPDATE — auctions ---

pub fn emit_auction_created(
    owner_id: &AccountId,
    token_id: &str,
    auction: &crate::sale::AuctionState,
    expires_at: Option<u64>,
) {
    EventBuilder::new(SCARCE, "auction_created", owner_id)
        .field("owner_id", owner_id)
        .field("token_id", token_id)
        .field("reserve_price", auction.reserve_price)
        .field_opt("buy_now_price", auction.buy_now_price)
        .field_opt("expires_at", expires_at)
        .field_opt("auction_duration_ns", auction.auction_duration_ns)
        .field("min_bid_increment", auction.min_bid_increment)
        .field("anti_snipe_extension_ns", auction.anti_snipe_extension_ns)
        .emit();
}

pub fn emit_auction_bid(bidder: &AccountId, token_id: &str, bid_amount: u128, bid_count: u32, new_expires_at: Option<u64>) {
    EventBuilder::new(SCARCE, "auction_bid", bidder)
        .field("bidder", bidder)
        .field("token_id", token_id)
        .field("bid_amount", bid_amount)
        .field("bid_count", bid_count)
        .field_opt("new_expires_at", new_expires_at)
        .emit();
}

pub fn emit_auction_settled(
    winner_id: &AccountId,
    seller_id: &AccountId,
    token_id: &str,
    winning_bid: u128,
    revenue: u128,
    app_pool_amount: u128,
) {
    EventBuilder::new(SCARCE, "auction_settled", winner_id)
        .field("winner_id", winner_id)
        .field("seller_id", seller_id)
        .field("token_id", token_id)
        .field("winning_bid", winning_bid)
        .field("revenue", revenue)
        .field("app_pool_amount", app_pool_amount)
        .emit();
}

pub fn emit_auction_cancelled(actor_id: &AccountId, token_id: &str, reason: &str) {
    EventBuilder::new(SCARCE, "auction_cancelled", actor_id)
        .field("actor_id", actor_id)
        .field("token_id", token_id)
        .field("reason", reason)
        .emit();
}

// --- SCARCE_UPDATE — quick mint ---

pub fn emit_quick_mint(actor_id: &AccountId, token_id: &str) {
    EventBuilder::new(SCARCE, "quick_mint", actor_id)
        .field("token_id", token_id)
        .field("owner_id", actor_id)
        .emit();
}
