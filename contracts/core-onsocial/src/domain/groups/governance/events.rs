use near_sdk::serde_json;
use near_sdk::{AccountId, env};

use crate::SocialError;
use crate::constants::*;
use crate::domain::groups::proposal_types::VoteTally;
use crate::events::{EventBatch, EventBuilder};

pub(super) struct ProposalCreated<'a> {
    pub proposer: &'a AccountId,
    pub group_id: &'a str,
    pub proposal_id: &'a str,
    pub sequence_number: u64,
    pub proposal_type: &'a str,
    pub target: &'a str,
    pub auto_vote: bool,
    pub created_at: u64,
    pub voting_period: u64,
    pub locked_member_count: u64,
    pub participation_quorum_bps: u16,
    pub majority_threshold_bps: u16,
    pub locked_deposit: u128,
    pub proposal_data: serde_json::Value,
    pub proposal_path: &'a str,
    pub tally_path: &'a str,
    pub tally_value: serde_json::Value,
    pub counter_path: &'a str,
    pub counter_value: u64,
}

impl ProposalCreated<'_> {
    pub fn emit(&self) -> Result<(), SocialError> {
        let expires_at = self.created_at.saturating_add(self.voting_period);

        let mut event_batch = EventBatch::new();
        let mut builder = EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "proposal_created",
            self.proposer.clone(),
        )
        .with_field("group_id", self.group_id)
        .with_field("proposal_id", self.proposal_id)
        .with_field("sequence_number", self.sequence_number)
        .with_field("proposal_type", self.proposal_type)
        .with_field("proposer", self.proposer.as_str())
        .with_field("target", self.target)
        .with_field("auto_vote", self.auto_vote)
        .with_field("created_at", self.created_at.to_string())
        .with_field("expires_at", expires_at.to_string())
        .with_field("locked_member_count", self.locked_member_count)
        .with_field("participation_quorum_bps", self.participation_quorum_bps)
        .with_field("majority_threshold_bps", self.majority_threshold_bps)
        .with_field("voting_period", self.voting_period.to_string())
        .with_field("locked_deposit", self.locked_deposit.to_string())
        .with_path(self.proposal_path)
        .with_value(self.proposal_data.clone())
        .with_field("tally_path", self.tally_path)
        .with_field("counter_path", self.counter_path)
        .with_write(self.counter_path, self.counter_value);

        if !self.auto_vote {
            builder = builder.with_write(self.tally_path, self.tally_value.clone());
        }

        builder.emit(&mut event_batch);
        event_batch.emit()
    }
}

pub(super) struct VoteCast<'a> {
    pub voter: &'a AccountId,
    pub group_id: &'a str,
    pub proposal_id: &'a str,
    pub approve: bool,
    pub tally: &'a VoteTally,
    pub should_execute: bool,
    pub should_reject: bool,
    pub vote_path: &'a str,
    pub vote_value: serde_json::Value,
    pub tally_path: &'a str,
    pub tally_value: serde_json::Value,
}

impl VoteCast<'_> {
    pub fn emit(&self) -> Result<(), SocialError> {
        let participation_bps: u64 = if self.tally.locked_member_count > 0 {
            (self.tally.total_votes as u128)
                .saturating_mul(10_000)
                .checked_div(self.tally.locked_member_count as u128)
                .unwrap_or(0) as u64
        } else {
            0
        };
        let approval_bps: u64 = if self.tally.total_votes > 0 {
            (self.tally.yes_votes as u128)
                .saturating_mul(10_000)
                .checked_div(self.tally.total_votes as u128)
                .unwrap_or(0) as u64
        } else {
            0
        };

        let mut event_batch = EventBatch::new();
        EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", self.voter.clone())
            .with_field("group_id", self.group_id)
            .with_field("proposal_id", self.proposal_id)
            .with_field("voter", self.voter.as_str())
            .with_field("approve", self.approve)
            .with_field("total_votes", self.tally.total_votes)
            .with_field("yes_votes", self.tally.yes_votes)
            .with_field(
                "no_votes",
                self.tally.total_votes.saturating_sub(self.tally.yes_votes),
            )
            .with_field("locked_member_count", self.tally.locked_member_count)
            .with_field("participation_bps", participation_bps)
            .with_field("approval_bps", approval_bps)
            .with_field("should_execute", self.should_execute)
            .with_field("should_reject", self.should_reject)
            .with_path(self.vote_path)
            .with_value(self.vote_value.clone())
            .with_field("tally_path", self.tally_path)
            .with_write(self.tally_path, self.tally_value.clone())
            .with_field("voted_at", env::block_timestamp().to_string())
            .emit(&mut event_batch);

        event_batch.emit()
    }
}

pub(super) struct ProposalStatusUpdated<'a> {
    pub group_id: &'a str,
    pub proposal_id: &'a str,
    pub proposer: &'a AccountId,
    pub status: &'a str,
    pub final_total_votes: u64,
    pub final_yes_votes: u64,
    pub locked_member_count: u64,
    pub unlocked_deposit: u128,
    pub proposal_path: &'a str,
    pub proposal_value: serde_json::Value,
}

impl ProposalStatusUpdated<'_> {
    pub fn emit(&self) -> Result<(), SocialError> {
        let mut event_batch = EventBatch::new();

        EventBuilder::new(
            EVENT_TYPE_GROUP_UPDATE,
            "proposal_status_updated",
            self.proposer.clone(),
        )
        .with_field("group_id", self.group_id)
        .with_field("proposal_id", self.proposal_id)
        .with_field("proposer", self.proposer.as_str())
        .with_field("status", self.status)
        .with_field("final_total_votes", self.final_total_votes)
        .with_field("final_yes_votes", self.final_yes_votes)
        .with_field(
            "final_no_votes",
            self.final_total_votes.saturating_sub(self.final_yes_votes),
        )
        .with_field("locked_member_count", self.locked_member_count)
        .with_field("unlocked_deposit", self.unlocked_deposit.to_string())
        .with_field("updated_at", env::block_timestamp().to_string())
        .with_path(self.proposal_path)
        .with_value(self.proposal_value.clone())
        .emit(&mut event_batch);

        event_batch.emit()
    }
}
