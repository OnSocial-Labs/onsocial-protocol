//! Shared native pipeline: protocol contract set + block → DatabaseChanges.
//!
//! Both native sources (neardata reader, node indexer) feed the SAME decode
//! path. This module is the single place that composition lives, so the two
//! binaries can never drift on params or step order.

use substreams_database_change::pb::database::DatabaseChanges;
use substreams_near::pb::sf::near::r#type::v1::Block;

use crate::combined_db_out::combined_db_out_impl;
use crate::map_combined_output_impl;

/// The six protocol contracts the combined map decodes (same params string
/// both writers use).
pub const PROTOCOL_PARAMS: &str = "core=core.onsocial.testnet&boost=boost.onsocial.testnet&rewards=rewards.onsocial.testnet&token=token.onsocial.testnet&scarces=scarces.onsocial.testnet&social_spend=social-spend.onsocial.testnet";

/// Decode one block into the DatabaseChanges for all protocol contracts.
pub fn changes_for_block(block: &Block) -> DatabaseChanges {
    let output = map_combined_output_impl(PROTOCOL_PARAMS, block);
    combined_db_out_impl(output)
}
