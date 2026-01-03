use near_sdk::json_types::U64;
use near_sdk::serde_json;

use crate::constants::*;
use crate::state::models::SocialPlatform;

use super::proposals::GroupGovernance;

/// Uses `U64` for JavaScript interoperability (serializes as string).
#[derive(serde::Serialize, serde::Deserialize, Clone, Copy, Debug)]
pub struct VotingConfig {
    #[serde(default = "default_participation_quorum_bps")]
    pub participation_quorum_bps: u16,
    #[serde(default = "default_majority_threshold_bps")]
    pub majority_threshold_bps: u16,
    #[serde(default = "default_voting_period")]
    pub voting_period: U64,
}

fn default_participation_quorum_bps() -> u16 {
    DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS
}

fn default_majority_threshold_bps() -> u16 {
    DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS
}

fn default_voting_period() -> U64 {
    U64(DEFAULT_VOTING_PERIOD)
}

impl Default for VotingConfig {
    fn default() -> Self {
        Self {
            participation_quorum_bps: DEFAULT_VOTING_PARTICIPATION_QUORUM_BPS,
            majority_threshold_bps: DEFAULT_VOTING_MAJORITY_THRESHOLD_BPS,
            voting_period: U64(DEFAULT_VOTING_PERIOD),
        }
    }
}

impl VotingConfig {
    pub fn sanitized(self) -> Self {
        Self {
            participation_quorum_bps: self
                .participation_quorum_bps
                .clamp(MIN_VOTING_PARTICIPATION_QUORUM_BPS, BPS_DENOMINATOR),
            majority_threshold_bps: self
                .majority_threshold_bps
                .clamp(MIN_VOTING_MAJORITY_THRESHOLD_BPS, BPS_DENOMINATOR),
            voting_period: U64(self.voting_period.0.clamp(MIN_VOTING_PERIOD, MAX_VOTING_PERIOD)),
        }
    }
}

impl GroupGovernance {
    pub(super) fn get_voting_config(platform: &SocialPlatform, group_id: &str) -> VotingConfig {
        let config_key = format!("groups/{}/config", group_id);
        if let Some(config) = platform.storage_get(&config_key) {
            if let Some(voting_config_val) = config.get("voting_config") {
                if let Ok(voting_config) = serde_json::from_value::<VotingConfig>(voting_config_val.clone()) {
                    return voting_config.sanitized();
                }
            }
        }
        VotingConfig::default()
    }

    pub(super) fn parse_proposal_voting_config(
        proposal_data: &serde_json::Value,
    ) -> Result<VotingConfig, crate::SocialError> {
        let voting_config_val = proposal_data
            .get("voting_config")
            .ok_or_else(|| crate::invalid_input!("Proposal missing voting_config"))?;
        serde_json::from_value::<VotingConfig>(voting_config_val.clone())
            .map_err(|_| crate::invalid_input!("Invalid voting_config format"))
    }
}
