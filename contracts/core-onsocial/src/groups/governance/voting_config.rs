use near_sdk::serde_json;

use crate::constants::*;
use crate::state::models::SocialPlatform;

use super::proposals::GroupGovernance;

impl GroupGovernance {
    pub(super) fn parse_u64_any(value: &serde_json::Value) -> Option<u64> {
        value
            .as_u64()
            .or_else(|| value.as_str().and_then(|s| s.parse::<u64>().ok()))
    }

    pub(super) fn parse_u16_any(value: &serde_json::Value) -> Option<u16> {
        value
            .as_u64()
            .and_then(|v| u16::try_from(v).ok())
            .or_else(|| value.as_str().and_then(|s| s.parse::<u16>().ok()))
    }

    fn clamp_bps(value: u16) -> u16 {
        value.min(BPS_DENOMINATOR)
    }

    /// Returns (participation_quorum_bps, majority_threshold_bps, voting_period) from config or defaults.
    pub(super) fn get_voting_config(platform: &SocialPlatform, group_id: &str) -> (u16, u16, u64) {
        let config_key = format!("groups/{}/config", group_id);
        if let Some(config) = platform.storage_get(&config_key) {
            if let Some(voting_config) = config.get("voting_config") {
                let participation_quorum_bps = voting_config
                    .get("participation_quorum_bps")
                    .and_then(Self::parse_u16_any)
                    .unwrap_or(DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS);
                let majority_threshold_bps = voting_config
                    .get("majority_threshold_bps")
                    .and_then(Self::parse_u16_any)
                    .unwrap_or(DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS);
                let voting_period = voting_config
                    .get("voting_period")
                    .and_then(Self::parse_u64_any)
                    .unwrap_or(DEFAULT_VOTING_PERIOD);

                // Clamp to prevent invalid configurations.
                let safe_quorum_bps = Self::clamp_bps(participation_quorum_bps);
                let safe_threshold_bps = Self::clamp_bps(majority_threshold_bps);
                let safe_period = if voting_period == 0 {
                    DEFAULT_VOTING_PERIOD
                } else {
                    voting_period
                };

                return (safe_quorum_bps, safe_threshold_bps, safe_period);
            }
        }
        // Return defaults if no custom config found
        (
            DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS,
            DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS,
            DEFAULT_VOTING_PERIOD,
        )
    }
}
