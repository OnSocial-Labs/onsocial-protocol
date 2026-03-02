use near_sdk::{AccountId, near, serde_json::Value};

use crate::{Contract, ContractExt};

#[near]
impl Contract {
    pub fn get_proposal(&self, group_id: String, proposal_id: String) -> Option<Value> {
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        self.platform.storage_get(&proposal_path)
    }

    pub fn get_proposal_tally(&self, group_id: String, proposal_id: String) -> Option<Value> {
        let tally_path = format!("groups/{}/votes/{}", group_id, proposal_id);
        self.platform.storage_get(&tally_path)
    }

    pub fn get_vote(
        &self,
        group_id: String,
        proposal_id: String,
        voter: AccountId,
    ) -> Option<Value> {
        let vote_path = format!("groups/{}/votes/{}/{}", group_id, proposal_id, voter);
        self.platform.storage_get(&vote_path)
    }

    /// Resolve sequence number (1-based) to full proposal via the on-chain index.
    pub fn get_proposal_by_sequence(
        &self,
        group_id: String,
        sequence_number: u64,
    ) -> Option<Value> {
        let index_path = format!("groups/{}/proposal_index/{}", group_id, sequence_number);
        let proposal_id = self
            .platform
            .storage_get(&index_path)?
            .as_str()
            .map(|s| s.to_string())?;
        let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
        self.platform.storage_get(&proposal_path)
    }

    pub fn get_proposal_count(&self, group_id: String) -> u64 {
        let counter_path = format!("groups/{}/proposal_counter", group_id);
        self.platform
            .storage_get(&counter_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0)
    }

    /// Newest-first. `from_sequence` is inclusive (defaults to latest). Limit capped at 50.
    /// Only returns proposals written after the index was deployed.
    pub fn list_proposals(
        &self,
        group_id: String,
        from_sequence: Option<u64>,
        limit: Option<u64>,
    ) -> Vec<Value> {
        let counter_path = format!("groups/{}/proposal_counter", group_id);
        let total = self
            .platform
            .storage_get(&counter_path)
            .and_then(|v| v.as_u64())
            .unwrap_or(0);

        if total == 0 {
            return vec![];
        }

        let start = match from_sequence {
            Some(s) if s > 0 && s <= total => s,
            _ => total,
        };
        let limit = limit.unwrap_or(20).min(50);

        let mut results = Vec::with_capacity(limit as usize);
        let mut seq = start;
        while seq > 0 && results.len() < limit as usize {
            let index_path = format!("groups/{}/proposal_index/{}", group_id, seq);
            if let Some(proposal_id_val) = self.platform.storage_get(&index_path) {
                if let Some(proposal_id) = proposal_id_val.as_str() {
                    let proposal_path = format!("groups/{}/proposals/{}", group_id, proposal_id);
                    if let Some(proposal) = self.platform.storage_get(&proposal_path) {
                        results.push(proposal);
                    }
                }
            }
            seq -= 1;
        }
        results
    }
}
