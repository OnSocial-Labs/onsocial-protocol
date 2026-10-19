//! onsocial-indexer — the self-hosted-node rail of the OnSocial indexer.
//!
//! Dual-source end state:
//!
//! - `neardata_reader` (bin in `onsocial-substreams`) polls neardata.xyz —
//!   the managed source, kept as backup. Renamed to
//!   `onsocial-indexer-backfill` only after cutover, with its cursor id.
//! - `onsocial-indexer` (this crate) embeds a NEAR node and consumes its
//!   `StreamerMessage`s at the tip — the primary source after cutover.
//!   Cursor id is `indexer`.
//!
//! Both feed the SAME decode path (`parse_neardata_block` →
//! `map_combined_output_impl` → `combined_db_out_impl` → Postgres) through
//! the SAME writer (`onsocial_substreams::writer`), so table contents are
//! bit-identical regardless of source. The only source-specific code in this
//! crate is the compatibility shim below plus the `onsocial-indexer` runner bin.
//!
//! The nearcore pin follows `near-firehose-indexer` branch `release/v2.x`
//! (`rev = "2.14.0-rc.2"`), which matches what testnet validators run
//! (protocol 87). Bump with nearcore releases; keep the two pins in lockstep.

#[cfg(feature = "nearcore")]
mod convert {
    use onsocial_substreams::neardata::parse_neardata_block;
    use substreams_near::pb::sf::near::r#type::v1::Block;

    /// near-indexer `StreamerMessage` → the protobuf `Block` the shared
    /// decoder consumes.
    ///
    /// Deliberately a JSON round-trip (`StreamerMessage: Serialize` → string
    /// → `parse_neardata_block`) instead of a field-by-field conversion:
    /// `neardata.rs` stays the single codec where the JSON→protobuf mapping
    /// lives, so the two sources can never drift apart when that mapping
    /// changes. The shim costs ~1 ms/block of serde — noise next to the
    /// Postgres apply.
    pub fn streamer_message_to_block(
        msg: &near_indexer_primitives::StreamerMessage,
    ) -> Result<Block, serde_json::Error> {
        let json = serde_json::to_string(msg).expect("StreamerMessage always serializes");
        parse_neardata_block(&json)
    }
}

#[cfg(feature = "nearcore")]
pub use convert::streamer_message_to_block;

#[cfg(test)]
mod tests {
    /// The crate must link `onsocial-substreams` as an rlib and reach the
    /// shared decode path end to end (parse → map → db_out) — the property
    /// every later PR builds on.
    #[test]
    fn shared_decode_path_is_reachable() {
        let json = r#"{
          "block": {
            "header": {
              "height": 273239505,
              "timestamp": 1792098698739525363,
              "timestamp_nanosec": "1792098698739525363",
              "hash": "6MczKfmYR1C8k1bHQb34m5TRiJNq6bSo6WVZehSwmaHG"
            }
          },
          "shards": []
        }"#;
        let block = onsocial_substreams::neardata::parse_neardata_block(json).expect("parse");
        assert_eq!(block.header.as_ref().unwrap().height, 273239505);

        let output = onsocial_substreams::map_combined_output_impl(
            "core=core.onsocial.testnet",
            &block,
        );
        let changes = onsocial_substreams::combined_db_out::combined_db_out_impl(output);
        assert!(changes.table_changes.is_empty());
    }
}
