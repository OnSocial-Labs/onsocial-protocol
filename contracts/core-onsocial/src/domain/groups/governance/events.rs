use near_sdk::serde_json;
use near_sdk::{AccountId, env};

use crate::constants::*;
use crate::domain::groups::proposal_types::VoteTally;
use crate::events::{EventBatch, EventBuilder};

pub(super) fn emit_proposal_created(
    proposer: &AccountId,
    group_id: &str,
    proposal_id: &str,
    sequence_number: u64,
    proposal_type: &str,
    target: &str,
    auto_vote: bool,
    created_at: u64,
    voting_period: u64,
    locked_member_count: u64,
    participation_quorum_bps: u16,
    majority_threshold_bps: u16,
    locked_deposit: u128,
    proposal_data: serde_json::Value,
    proposal_path: &str,
    tally_path: &str,
    tally_value: serde_json::Value,
    counter_path: &str,
    counter_value: u64,
) -> Result<(), crate::SocialError> {
    let expires_at = created_at.saturating_add(voting_period);

    let mut event_batch = EventBatch::new();
    let mut builder = EventBuilder::new(
        EVENT_TYPE_GROUP_UPDATE,
        "proposal_created",
        proposer.clone(),
    )
    .with_field("group_id", group_id)
    .with_field("proposal_id", proposal_id)
    .with_field("sequence_number", sequence_number)
    .with_field("proposal_type", proposal_type)
    .with_field("proposer", proposer.as_str())
    .with_field("target", target)
    .with_field("auto_vote", auto_vote)
    .with_field("created_at", created_at.to_string())
    .with_field("expires_at", expires_at.to_string())
    .with_field("locked_member_count", locked_member_count)
    .with_field("participation_quorum_bps", participation_quorum_bps)
    .with_field("majority_threshold_bps", majority_threshold_bps)
    .with_field("voting_period", voting_period.to_string())
    .with_field("locked_deposit", locked_deposit.to_string())
    .with_path(proposal_path)
    .with_value(proposal_data)
    .with_field("tally_path", tally_path)
    .with_field("counter_path", counter_path)
    .with_write(counter_path, counter_value);

    if !auto_vote {
        builder = builder.with_write(tally_path, tally_value);
    }

    builder.emit(&mut event_batch);

    event_batch.emit()?;

    Ok(())
}

pub(super) fn emit_vote_cast(
    voter: &AccountId,
    group_id: &str,
    proposal_id: &str,
    approve: bool,
    tally: &VoteTally,
    should_execute: bool,
    should_reject: bool,
    vote_path: &str,
    vote_value: serde_json::Value,
    tally_path: &str,
    tally_value: serde_json::Value,
) -> Result<(), crate::SocialError> {
    let participation_bps: u64 = if tally.locked_member_count > 0 {
        (tally.total_votes as u128)
            .saturating_mul(10_000)
            .checked_div(tally.locked_member_count as u128)
            .unwrap_or(0) as u64
    } else {
        0
    };
    let approval_bps: u64 = if tally.total_votes > 0 {
        (tally.yes_votes as u128)
            .saturating_mul(10_000)
            .checked_div(tally.total_votes as u128)
            .unwrap_or(0) as u64
    } else {
        0
    };

    let mut event_batch = EventBatch::new();
    EventBuilder::new(EVENT_TYPE_GROUP_UPDATE, "vote_cast", voter.clone())
        .with_field("group_id", group_id)
        .with_field("proposal_id", proposal_id)
        .with_field("voter", voter.as_str())
        .with_field("approve", approve)
        .with_field("total_votes", tally.total_votes)
        .with_field("yes_votes", tally.yes_votes)
        .with_field(
            "no_votes",
            tally.total_votes.saturating_sub(tally.yes_votes),
        )
        .with_field("locked_member_count", tally.locked_member_count)
        .with_field("participation_bps", participation_bps)
        .with_field("approval_bps", approval_bps)
        .with_field("should_execute", should_execute)
        .with_field("should_reject", should_reject)
        .with_path(vote_path)
        .with_value(vote_value)
        .with_field("tally_path", tally_path)
        .with_write(tally_path, tally_value)
        .with_field("voted_at", env::block_timestamp().to_string())
        .emit(&mut event_batch);

    event_batch.emit()?;

    Ok(())
}

pub(super) fn emit_proposal_status_updated(
    group_id: &str,
    proposal_id: &str,
    proposer: &AccountId,
    status: &str,
    final_total_votes: u64,
    final_yes_votes: u64,
    locked_member_count: u64,
    unlocked_deposit: u128,
    proposal_path: &str,
    proposal_value: serde_json::Value,
) -> Result<(), crate::SocialError> {
    let mut event_batch = EventBatch::new();

    EventBuilder::new(
        EVENT_TYPE_GROUP_UPDATE,
        "proposal_status_updated",
        proposer.clone(),
    )
    .with_field("group_id", group_id)
    .with_field("proposal_id", proposal_id)
    .with_field("proposer", proposer.as_str())
    .with_field("status", status)
    .with_field("final_total_votes", final_total_votes)
    .with_field("final_yes_votes", final_yes_votes)
    .with_field(
        "final_no_votes",
        final_total_votes.saturating_sub(final_yes_votes),
    )
    .with_field("locked_member_count", locked_member_count)
    .with_field("unlocked_deposit", unlocked_deposit.to_string())
    .with_field("updated_at", env::block_timestamp().to_string())
    .with_path(proposal_path)
    .with_value(proposal_value)
    .emit(&mut event_batch);

    event_batch.emit()?;

    Ok(())
}
