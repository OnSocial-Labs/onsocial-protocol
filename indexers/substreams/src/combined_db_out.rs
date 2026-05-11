//! Combined database changes writer.

use crate::boost_db_out;
use crate::core_db_out;
use crate::pb::combined::v1::CombinedOutput;
use crate::rewards_db_out;
use crate::scarces_db_out;
use crate::token_db_out;
use substreams_database_change::pb::database::DatabaseChanges;

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
