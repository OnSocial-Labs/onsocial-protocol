//! Database Changes module for scarces events
//!
//! Converts ScarcesOutput to DatabaseChanges for substreams-sink-sql.
//! Writes to: scarces_events (all events in one normalized table)
//!
//! The flat schema mirrors every named proto field as a nullable SQL column.
//! The `extra_data` JSON column preserves the full event payload so
//! future fields are never lost.

use crate::pb::scarces::v1::*;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

#[substreams::handlers::map]
pub fn scarces_db_out(output: ScarcesOutput) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut tables = Tables::new();

    for event in &output.events {
        write_scarces_event(&mut tables, event);
    }

    Ok(tables.to_database_changes())
}

pub(crate) fn write_scarces_event(tables: &mut Tables, e: &ScarcesEvent) {
    let row = tables.create_row("scarces_events", &e.id);

    // Core fields
    row.set("block_height", e.block_height);
    row.set("block_timestamp", e.block_timestamp);
    row.set("receipt_id", &e.receipt_id);
    row.set("event_type", &e.event_type);
    row.set("operation", &e.operation);
    row.set("author", &e.author);

    // Identity / routing
    row.set("token_id", &e.token_id);
    row.set("collection_id", &e.collection_id);
    row.set("listing_id", &e.listing_id);
    row.set("owner_id", &e.owner_id);
    row.set("creator_id", &e.creator_id);
    row.set("buyer_id", &e.buyer_id);
    row.set("seller_id", &e.seller_id);
    row.set("bidder", &e.bidder);
    row.set("winner_id", &e.winner_id);
    row.set("sender_id", &e.sender_id);
    row.set("receiver_id", &e.receiver_id);
    row.set("account_id", &e.account_id);
    row.set("executor", &e.executor);
    row.set("contract_id", &e.contract_id);

    // NFT contract reference
    row.set("scarce_contract_id", &e.scarce_contract_id);

    // Financial
    row.set("amount", &e.amount);
    row.set("price", &e.price);
    row.set("old_price", &e.old_price);
    row.set("new_price", &e.new_price);
    row.set("bid_amount", &e.bid_amount);
    row.set("attempted_price", &e.attempted_price);
    row.set("marketplace_fee", &e.marketplace_fee);
    row.set("app_pool_amount", &e.app_pool_amount);
    row.set("app_commission", &e.app_commission);
    row.set("creator_payment", &e.creator_payment);
    row.set("revenue", &e.revenue);
    row.set("new_balance", &e.new_balance);
    row.set("initial_balance", &e.initial_balance);
    row.set("refunded_amount", &e.refunded_amount);
    row.set("refund_per_token", &e.refund_per_token);
    row.set("refund_pool", &e.refund_pool);

    // Quantity / count
    row.set("quantity", e.quantity);
    row.set("total_supply", e.total_supply);
    row.set("redeem_count", e.redeem_count);
    row.set("max_redeems", e.max_redeems);
    row.set("bid_count", e.bid_count);
    row.set("refundable_count", e.refundable_count);

    // Auction
    row.set("reserve_price", &e.reserve_price);
    row.set("buy_now_price", &e.buy_now_price);
    row.set("min_bid_increment", &e.min_bid_increment);
    row.set("winning_bid", &e.winning_bid);
    row.set("expires_at", e.expires_at);
    row.set("auction_duration_ns", e.auction_duration_ns);
    row.set("anti_snipe_extension_ns", e.anti_snipe_extension_ns);

    // App pool
    row.set("app_id", &e.app_id);
    row.set("funder", &e.funder);

    // Ownership / transfers
    row.set("old_owner", &e.old_owner);
    row.set("new_owner", &e.new_owner);
    row.set("old_recipient", &e.old_recipient);
    row.set("new_recipient", &e.new_recipient);

    // Misc
    row.set("reason", &e.reason);
    row.set("mode", &e.mode);
    row.set("memo", &e.memo);

    // Array fields (JSON strings)
    row.set("token_ids", &e.token_ids);
    row.set("prices", &e.prices);
    row.set("receivers", &e.receivers);
    row.set("accounts", &e.accounts);

    // Contract config
    row.set("old_version", &e.old_version);
    row.set("new_version", &e.new_version);
    row.set("total_fee_bps", e.total_fee_bps);
    row.set("app_pool_fee_bps", e.app_pool_fee_bps);
    row.set("platform_storage_fee_bps", e.platform_storage_fee_bps);

    // Timing
    row.set("start_time", e.start_time);
    row.set("end_time", e.end_time);
    row.set("new_expires_at", e.new_expires_at);
    row.set("old_expires_at", e.old_expires_at);

    // Approval
    row.set("approval_id", e.approval_id);

    // Storage
    row.set("deposit", &e.deposit);
    row.set("remaining_balance", &e.remaining_balance);
    row.set("cap", &e.cap);

    // Full JSON catch-all
    row.set("extra_data", &e.extra_data);
}
