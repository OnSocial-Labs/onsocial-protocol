//! Combined Database Changes module
//!
//! Converts CombinedOutput to a single DatabaseChanges for substreams-sink-sql.
//! This delegates to each per-contract db_out writer, sharing a single Tables
//! instance so all changes are emitted as one atomic batch.
//!
//! Tables written: data_updates, storage_updates, group_updates,
//! contract_updates, permission_updates, boost_events, booster_state,
//! boost_credit_purchases, rewards_events, user_reward_state,
//! token_events, token_balances, scarces_events

use crate::boost_db_out;
use crate::core_db_out;
use crate::pb::combined::v1::CombinedOutput;
use crate::rewards_db_out;
use crate::scarces_db_out;
use crate::token_db_out;
use substreams_database_change::pb::database::DatabaseChanges;

/// Convert CombinedOutput to DatabaseChanges for SQL sink
#[substreams::handlers::map]
pub fn combined_db_out(
    output: CombinedOutput,
) -> Result<DatabaseChanges, substreams::errors::Error> {
    let mut changes = DatabaseChanges::default();

    if let Some(core) = output.core {
        let core_changes = core_db_out::core_db_out_impl(core);
        changes.table_changes.extend(core_changes.table_changes);
    }
    if let Some(boost) = output.boost {
        let boost_changes = boost_db_out::boost_db_out_impl(boost);
        changes.table_changes.extend(boost_changes.table_changes);
    }
    if let Some(rewards) = output.rewards {
        let rewards_changes = rewards_db_out::rewards_db_out_impl(rewards);
        changes.table_changes.extend(rewards_changes.table_changes);
    }
    if let Some(token) = output.token {
        let token_changes = token_db_out::token_db_out_impl(token);
        changes.table_changes.extend(token_changes.table_changes);
    }
    if let Some(scarces) = output.scarces {
        let scarces_changes = scarces_db_out::scarces_db_out_impl(scarces);
        changes.table_changes.extend(scarces_changes.table_changes);
    }

    Ok(changes)
}
