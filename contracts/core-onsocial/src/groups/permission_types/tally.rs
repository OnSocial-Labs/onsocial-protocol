use near_sdk::env;

use crate::constants::BPS_DENOMINATOR;

use super::types::VoteTally;

impl VoteTally {
    pub fn new(member_count: u64) -> Self {
        Self {
            yes_votes: 0,
            total_votes: 0,
            created_at: near_sdk::json_types::U64(env::block_timestamp()),
            locked_member_count: member_count,
        }
    }

    pub fn record_vote(&mut self, approve: bool, previous_vote: Option<bool>) {
        // Only allow voting if user hasn't voted before (no vote changes)
        if previous_vote.is_none() {
            if approve {
                self.yes_votes += 1;
            }
            self.total_votes += 1;
        }
        // If user has already voted, ignore the new vote (no changes allowed)
    }

    pub fn meets_thresholds(&self, participation_quorum_bps: u16, majority_threshold_bps: u16) -> bool {
        if self.total_votes == 0 || self.locked_member_count == 0 {
            return false;
        }

        let total_votes = self.total_votes as u128;
        let yes_votes = self.yes_votes as u128;
        let locked_member_count = self.locked_member_count as u128;
        let denom = BPS_DENOMINATOR as u128;
        let quorum_bps = participation_quorum_bps.min(BPS_DENOMINATOR) as u128;
        let majority_bps = majority_threshold_bps.min(BPS_DENOMINATOR) as u128;

        let meets_participation = total_votes.saturating_mul(denom) >= quorum_bps.saturating_mul(locked_member_count);
        let meets_majority = yes_votes.saturating_mul(denom) >= majority_bps.saturating_mul(total_votes);

        meets_participation && meets_majority
    }

    pub fn is_expired(&self, voting_period: u64) -> bool {
        // Use saturating_add to prevent overflow
        // If overflow would occur, saturating_add returns u64::MAX
        let expiration_time = self.created_at.0.saturating_add(voting_period);
        env::block_timestamp() >= expiration_time
    }

    /// Returns true if proposal defeat is mathematically inevitable.
    pub fn is_defeat_inevitable(&self, participation_quorum_bps: u16, majority_threshold_bps: u16) -> bool {
        if self.locked_member_count == 0 {
            return false;
        }

        let denom = BPS_DENOMINATOR as u128;
        let quorum_bps = participation_quorum_bps.min(BPS_DENOMINATOR) as u128;
        let majority_bps = majority_threshold_bps.min(BPS_DENOMINATOR) as u128;
        let total_members = self.locked_member_count as u128;
        let votes_cast = self.total_votes as u128;
        let yes_votes = self.yes_votes as u128;

        if votes_cast > total_members {
            return false;
        }

        let remaining_votes = total_members - votes_cast;
        let max_possible_yes = yes_votes + remaining_votes;
        let max_possible_total = total_members;

        let max_participation_possible =
            max_possible_total.saturating_mul(denom) >= quorum_bps.saturating_mul(total_members);
        let can_reach_majority =
            max_possible_yes.saturating_mul(denom) >= majority_bps.saturating_mul(max_possible_total);

        max_participation_possible && !can_reach_majority
    }
}
