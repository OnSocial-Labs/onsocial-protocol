//! neardata block JSON → protobuf `Block` conversion.
//!
//! neardata (`https://{network}.neardata.xyz/v0/block/{height}`) returns the
//! standard NEAR indexer `StreamerMessage` JSON shape:
//!
//! ```json
//! { "block": { "header": { "height": …, "timestamp_nanosec": "…", "hash": "…" } },
//!   "shards": [ { "shard_id": 0, "receipt_execution_outcomes": [ … ] } ] }
//! ```
//!
//! Only the fields `block_walker` reads are populated; every other protobuf
//! field is left at its default. This keeps the production decode path
//! (`map_combined_output` → `combined_db_out`) bit-identical to what the
//! Substreams Firehose runtime delivered.

use substreams_near::pb::sf::near::r#type::v1::{
    Block, BlockHeader, CryptoHash, ExecutionOutcome, ExecutionOutcomeWithId,
    IndexerExecutionOutcomeWithReceipt, IndexerShard, Receipt,
};

/// Minimal serde view over the neardata JSON. Unknown fields are ignored so
/// neardata schema additions never break the reader.
#[derive(Debug, serde::Deserialize)]
pub struct StreamerMessage {
    pub block: BlockView,
    #[serde(default)]
    pub shards: Vec<ShardView>,
}

#[derive(Debug, serde::Deserialize)]
pub struct BlockView {
    pub header: HeaderView,
}

#[derive(Debug, serde::Deserialize)]
pub struct HeaderView {
    pub height: u64,
    #[serde(default)]
    pub timestamp: u64,
    #[serde(default)]
    pub timestamp_nanosec: Option<serde_json::Value>,
    #[serde(default)]
    pub hash: Option<String>,
}

#[derive(Debug, serde::Deserialize)]
pub struct ShardView {
    #[serde(default)]
    pub receipt_execution_outcomes: Vec<ReceiptExecutionView>,
}

/// neardata emits one JSON object per receipt/outcome pair:
/// `{ "receipt": {…}, "execution_outcome": { "outcome": { "logs": […] } } }`.
/// The nested `receipt.receipt` payload is a tagged enum we do not need — the
/// walker only uses `receiver_id` and `receipt_id` from the outer object.
#[derive(Debug, serde::Deserialize)]
pub struct ReceiptExecutionView {
    pub receipt: ReceiptView,
    pub execution_outcome: ExecutionOutcomeView,
}

#[derive(Debug, serde::Deserialize)]
pub struct ReceiptView {
    #[serde(default)]
    pub receiver_id: String,
    #[serde(default)]
    pub receipt_id: String,
}

#[derive(Debug, serde::Deserialize)]
pub struct ExecutionOutcomeView {
    pub outcome: OutcomeView,
}

#[derive(Debug, serde::Deserialize)]
pub struct OutcomeView {
    #[serde(default)]
    pub logs: Vec<String>,
}

fn decode_hash(s: &str) -> Option<CryptoHash> {
    let bytes = bs58::decode(s).into_vec().ok()?;
    Some(CryptoHash { bytes })
}

/// nanosec timestamp: prefer `timestamp_nanosec` (string or number), fall
/// back to `timestamp` (which is already nanoseconds in NEAR JSON-RPC).
fn timestamp_nanosec(h: &HeaderView) -> u64 {
    if let Some(v) = &h.timestamp_nanosec {
        match v {
            serde_json::Value::String(s) => return s.parse().unwrap_or(h.timestamp),
            serde_json::Value::Number(n) => return n.as_u64().unwrap_or(h.timestamp),
            _ => {}
        }
    }
    h.timestamp
}

impl StreamerMessage {
    /// Converts to the protobuf `Block` the decoder pipeline consumes.
    pub fn into_block(self) -> Block {
        let header = BlockHeader {
            height: self.block.header.height,
            timestamp_nanosec: timestamp_nanosec(&self.block.header),
            hash: self
                .block
                .header
                .hash
                .as_deref()
                .and_then(decode_hash),
            ..Default::default()
        };

        let shards = self
            .shards
            .into_iter()
            .map(|shard| {
                let receipt_execution_outcomes = shard
                    .receipt_execution_outcomes
                    .into_iter()
                    .map(|r| {
                        let receipt = Receipt {
                            receiver_id: r.receipt.receiver_id,
                            receipt_id: decode_hash(&r.receipt.receipt_id),
                            ..Default::default()
                        };
                        let outcome = ExecutionOutcome {
                            logs: r.execution_outcome.outcome.logs,
                            ..Default::default()
                        };
                        let with_id = ExecutionOutcomeWithId {
                            outcome: Some(outcome),
                            ..Default::default()
                        };
                        IndexerExecutionOutcomeWithReceipt {
                            receipt: Some(receipt),
                            execution_outcome: Some(with_id),
                        }
                    })
                    .collect();

                IndexerShard {
                    receipt_execution_outcomes,
                    ..Default::default()
                }
            })
            .collect();

        Block {
            header: Some(header),
            shards,
            ..Default::default()
        }
    }
}

/// Parses a neardata response body into a protobuf `Block`.
pub fn parse_neardata_block(json: &str) -> Result<Block, serde_json::Error> {
    let msg: StreamerMessage = serde_json::from_str(json)?;
    Ok(msg.into_block())
}

/// bs58 block hash, matching `block_walker::block_context().block_hash`.
pub fn block_hash(block: &Block) -> String {
    block
        .header
        .as_ref()
        .and_then(|h| h.hash.as_ref())
        .map(|h| bs58::encode(&h.bytes).into_string())
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::block_walker::{block_context, for_each_event_log};

    #[test]
    fn parses_streamer_message_and_feeds_walker() {
        let json = r#"{
          "block": {
            "author": "validator",
            "chunks": [],
            "header": {
              "height": 273239505,
              "timestamp": 1792098698739525363,
              "timestamp_nanosec": "1792098698739525363",
              "hash": "6MczKfmYR1C8k1bHQb34m5TRiJNq6bSo6WVZehSwmaHG"
            }
          },
          "shards": [
            {
              "shard_id": 10,
              "chunk": {},
              "receipt_execution_outcomes": [
                {
                  "receipt": {
                    "predecessor_id": "x.testnet",
                    "priority": 0,
                    "receipt": {"Action": {}},
                    "receipt_id": "6TaCpbj4bTPHxBPQWkhSvrudz9V5r58q9pKF2hAfAeww",
                    "receiver_id": "boost.onsocial.testnet"
                  },
                  "execution_outcome": {
                    "outcome": {
                      "executor_id": "boost.onsocial.testnet",
                      "gas_burnt": 1,
                      "logs": [
                        "EVENT_JSON:{\"standard\":\"onsocial\",\"event\":\"REWARDS_CLAIM\"}",
                        "not an event"
                      ],
                      "metadata": {},
                      "receipt_ids": [],
                      "status": {},
                      "tokens_burnt": "0"
                    }
                  }
                }
              ],
              "state_changes": []
            }
          ]
        }"#;

        let block = parse_neardata_block(json).expect("parse");
        let ctx = block_context(&block);
        assert_eq!(ctx.block_height, 273239505);
        assert_eq!(ctx.block_timestamp, 1792098698739525363);
        assert!(!ctx.block_hash.is_empty());

        let mut hits = Vec::new();
        for_each_event_log(&block, Some("boost.onsocial.testnet"), |log| {
            hits.push((log.receipt_id.clone(), log.json_data.to_string(), log.log_index));
        });
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].0, "6TaCpbj4bTPHxBPQWkhSvrudz9V5r58q9pKF2hAfAeww");
        assert!(hits[0].1.contains("REWARDS_CLAIM"));
        assert_eq!(hits[0].2, 0); // second log skipped, index preserved
    }

    #[test]
    fn tolerates_extra_fields_and_missing_shards() {
        let json = r#"{
          "block": { "header": { "height": 1, "timestamp": 5, "hash": "11111111111111111111111111111111" } },
          "shards": []
        }"#;
        let block = parse_neardata_block(json).expect("parse");
        assert_eq!(block.header.unwrap().height, 1);
        assert!(block.shards.is_empty());
    }
}
