use near_sdk::{near, serde_json::Value, AccountId};

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
}
