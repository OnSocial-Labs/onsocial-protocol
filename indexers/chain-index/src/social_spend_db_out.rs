//! SQL sink writer for social-spend events.

use crate::pb::social_spend::v1::*;
use substreams_database_change::pb::database::DatabaseChanges;
use substreams_database_change::tables::Tables;

#[substreams::handlers::map]
pub fn social_spend_db_out(
    output: SocialSpendOutput,
) -> Result<DatabaseChanges, substreams::errors::Error> {
    Ok(social_spend_db_out_impl(output))
}

pub(crate) fn social_spend_db_out_impl(output: SocialSpendOutput) -> DatabaseChanges {
    let mut tables = Tables::new();

    for event in &output.events {
        write_social_spend_event(&mut tables, event);
    }

    tables.to_database_changes()
}

pub(crate) fn write_social_spend_event(tables: &mut Tables, event: &SocialSpendEvent) {
    let row = tables.create_row("social_spend_events", &event.id);

    row.set("block_height", event.block_height);
    row.set("block_timestamp", event.block_timestamp);
    row.set("receipt_id", &event.receipt_id);
    row.set("account_id", &event.account_id);
    row.set("event_type", &event.event_type);
    row.set("success", event.success);

    row.set("spender_id", &event.spender_id);
    row.set("amount", &event.amount);
    row.set("app_id", &event.app_id);
    row.set("action", &event.action);
    row.set("target_type", &event.target_type);
    row.set("target_id", &event.target_id);
    row.set("season_id", &event.season_id);
    row.set("tag", &event.tag);
    row.set("recipient_id", &event.recipient_id);
    row.set("treasury_amount", &event.treasury_amount);
    row.set("season_amount", &event.season_amount);
    row.set("target_amount", &event.target_amount);
    row.set("metadata", &event.metadata);

    row.set("label", &event.label);
    row.set("active", event.active);
    row.set("starts_at_ns", event.starts_at_ns);
    row.set("ends_at_ns", event.ends_at_ns);
    row.set("claim_starts_at_ns", event.claim_starts_at_ns);
    row.set("root", &event.root);
    row.set("total_amount", &event.total_amount);

    row.set("paused", event.paused);
    row.set("old_treasury_id", &event.old_treasury_id);
    row.set("treasury_id", &event.treasury_id);
    row.set("settlement_publisher", &event.settlement_publisher);
    row.set("owner_id", &event.owner_id);
    row.set("old_version", &event.old_version);
    row.set("new_version", &event.new_version);

    row.set("extra_data", &event.extra_data);
}
