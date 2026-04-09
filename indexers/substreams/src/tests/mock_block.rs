//! Mock NEAR block builder for integration tests.
//!
//! Constructs realistic `Block` structures with shards, receipts, outcomes,
//! and logs — exactly as the Substreams runtime delivers them.

use substreams_near::pb::sf::near::r#type::v1::{
    Block, BlockHeader, CryptoHash, ExecutionOutcome, ExecutionOutcomeWithId,
    IndexerExecutionOutcomeWithReceipt, IndexerShard, Receipt,
};

/// Builder for a mock NEAR block.
pub struct MockBlockBuilder {
    height: u64,
    timestamp_nanosec: u64,
    hash_bytes: Vec<u8>,
    shards: Vec<MockShard>,
}

struct MockShard {
    receipts: Vec<MockReceipt>,
}

struct MockReceipt {
    receiver_id: String,
    receipt_id_bytes: Vec<u8>,
    logs: Vec<String>,
}

impl MockBlockBuilder {
    pub fn new(height: u64, timestamp_nanosec: u64) -> Self {
        Self {
            height,
            timestamp_nanosec,
            hash_bytes: vec![1, 2, 3, 4, 5, 6, 7, 8],
            shards: Vec::new(),
        }
    }

    /// Add a receipt with EVENT_JSON logs to the block.
    /// `event_jsons` are the raw JSON strings (without the `EVENT_JSON:` prefix).
    pub fn add_receipt(
        mut self,
        receiver_id: &str,
        receipt_id_bytes: &[u8],
        event_jsons: Vec<&str>,
    ) -> Self {
        let logs: Vec<String> = event_jsons
            .into_iter()
            .map(|j| format!("EVENT_JSON:{}", j))
            .collect();

        // Find or create shard
        if self.shards.is_empty() {
            self.shards.push(MockShard {
                receipts: Vec::new(),
            });
        }
        let shard = self.shards.last_mut().unwrap();
        shard.receipts.push(MockReceipt {
            receiver_id: receiver_id.to_string(),
            receipt_id_bytes: receipt_id_bytes.to_vec(),
            logs,
        });
        self
    }

    /// Add a receipt with raw log lines (some EVENT_JSON, some not).
    pub fn add_receipt_raw_logs(
        mut self,
        receiver_id: &str,
        receipt_id_bytes: &[u8],
        logs: Vec<&str>,
    ) -> Self {
        if self.shards.is_empty() {
            self.shards.push(MockShard {
                receipts: Vec::new(),
            });
        }
        let shard = self.shards.last_mut().unwrap();
        shard.receipts.push(MockReceipt {
            receiver_id: receiver_id.to_string(),
            receipt_id_bytes: receipt_id_bytes.to_vec(),
            logs: logs.into_iter().map(|s| s.to_string()).collect(),
        });
        self
    }

    /// Add a new empty shard (for testing multi-shard blocks).
    pub fn new_shard(mut self) -> Self {
        self.shards.push(MockShard {
            receipts: Vec::new(),
        });
        self
    }

    pub fn build(self) -> Block {
        let header = BlockHeader {
            height: self.height,
            timestamp_nanosec: self.timestamp_nanosec,
            hash: Some(CryptoHash {
                bytes: self.hash_bytes,
            }),
            ..Default::default()
        };

        let shards = self
            .shards
            .into_iter()
            .map(|shard| {
                let receipt_execution_outcomes = shard
                    .receipts
                    .into_iter()
                    .map(|r| IndexerExecutionOutcomeWithReceipt {
                        receipt: Some(Receipt {
                            receiver_id: r.receiver_id,
                            receipt_id: Some(CryptoHash {
                                bytes: r.receipt_id_bytes,
                            }),
                            ..Default::default()
                        }),
                        execution_outcome: Some(ExecutionOutcomeWithId {
                            outcome: Some(ExecutionOutcome {
                                logs: r.logs,
                                ..Default::default()
                            }),
                            ..Default::default()
                        }),
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

/// Build a simple single-receipt block for one contract with one event log.
#[allow(dead_code)]
pub fn single_event_block(
    receiver_id: &str,
    event_json: &str,
    height: u64,
    timestamp: u64,
) -> Block {
    MockBlockBuilder::new(height, timestamp)
        .add_receipt(receiver_id, &[10, 20, 30], vec![event_json])
        .build()
}
