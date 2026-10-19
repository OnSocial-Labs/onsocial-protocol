//! Fixture round-trip: a REAL testnet block must decode identically via the
//! reader's direct neardata codec and via the node rail's
//! `StreamerMessage → JSON → codec` shim — and both paths must yield the
//! same `DatabaseChanges`. This is the test that proves "one writer, two
//! sources" cannot drift.
//!
//! The fixture is raw neardata `/v0/block/273239505` output: 10 shards, both
//! receipt kinds (Action + Data), real hashes and signatures.

#![cfg(feature = "nearcore")]

use onsocial_indexer::streamer_message_to_block;
use onsocial_substreams::neardata::parse_neardata_block;
use onsocial_substreams::pipeline::changes_for_block;
use substreams_database_change::pb::database::DatabaseChanges;

const FIXTURE: &str = include_str!("fixtures/block_273239505.json");

/// Sort fields within each TableChange by name.
///
/// Field ORDER is not source-stable: protobuf map fields are HashMaps, so
/// equal-content Blocks built from different JSON key orders (raw neardata
/// vs nearcore-reserialized) iterate those maps differently, and the decoder
/// emits fields in that order. `PartialEq` on the Block passes (maps compare
/// by content) and the writer is unaffected (per-column SQL), so the only
/// place order matters is a naive assert_eq on DatabaseChanges. Normalize
/// here instead of weakening the block-equality assertion above.
fn normalized(mut changes: DatabaseChanges) -> DatabaseChanges {
    for tc in &mut changes.table_changes {
        tc.fields.sort_by(|a, b| a.name.cmp(&b.name));
    }
    changes
}

#[test]
fn node_and_reader_paths_decode_identically() {
    // Reader path: neardata JSON straight into the shared codec.
    let direct = parse_neardata_block(FIXTURE).expect("direct parse");
    assert_eq!(direct.header.as_ref().unwrap().height, 273239505);

    // Node path: nearcore's own serde validates the same JSON as a
    // StreamerMessage (the type the embedded node emits), then the shim
    // routes it back through the SAME codec. If neardata's JSON and
    // nearcore's serde ever disagree (field renamed, new variant), this
    // line fails before any production drift can.
    let msg: near_indexer_primitives::StreamerMessage =
        serde_json::from_str(FIXTURE).expect("nearcore must deserialize neardata JSON");
    assert_eq!(msg.block.header.height, 273239505);
    let via_node = streamer_message_to_block(&msg).expect("shim parse");

    // Full structural parity — every shard, receipt, log, hash.
    assert_eq!(direct, via_node);

    // Same decoded block ⇒ same DB changes, once field order is normalized
    // (see `normalized`). A drift that altered any name/value/key still fails.
    assert_eq!(
        normalized(changes_for_block(&direct)),
        normalized(changes_for_block(&via_node))
    );

    // Regression anchor: this fixture carries a real REWARDS_CLAIM for
    // test05.onsocial.testnet — if the decode path ever stops extracting it,
    // this fails loudly instead of silently indexing empty rows.
    let changes = changes_for_block(&direct);
    assert_eq!(changes.table_changes.len(), 2);
    assert_eq!(changes.table_changes[0].table, "boost_events");
    assert!(
        changes.table_changes[0]
            .fields
            .iter()
            .any(|f| f.name == "event_type" && f.new_value == "REWARDS_CLAIM"),
        "expected REWARDS_CLAIM event in fixture changes"
    );
    assert_eq!(changes.table_changes[1].table, "booster_state");
}
