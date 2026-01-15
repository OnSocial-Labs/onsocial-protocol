use near_sdk::{json_types::U64, AccountId, serde_json::Value};

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub enum ProposalType {
    GroupUpdate { update_type: String, changes: Value },
    PermissionChange { target_user: AccountId, level: u8, reason: Option<String> },
    PathPermissionGrant { target_user: AccountId, path: String, level: u8, reason: String },
    PathPermissionRevoke { target_user: AccountId, path: String, reason: String },
    /// Invite a new member. Members always join with level=NONE; elevated roles granted separately.
    MemberInvite { target_user: AccountId, message: Option<String> },
    /// Request to join. Members always join with level=NONE; elevated roles granted separately.
    JoinRequest { requester: AccountId, message: Option<String> },
    VotingConfigChange {
        participation_quorum_bps: Option<u16>,
        majority_threshold_bps: Option<u16>,
        voting_period: Option<u64>,
    },
    CustomProposal { title: String, description: String, custom_data: Value },
}

/// Vote tally. `locked_member_count` is fixed at proposal creation for consistent quorum.
#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct VoteTally {
    pub yes_votes: u64,
    pub total_votes: u64,
    pub created_at: U64,
    pub locked_member_count: u64,
}

impl ProposalType {
    pub fn name(&self) -> String {
        match self {
            Self::GroupUpdate { update_type, .. } => format!("group_update_{}", update_type),
            Self::PermissionChange { .. } => "permission_change".to_string(),
            Self::PathPermissionGrant { .. } => "path_permission_grant".to_string(),
            Self::PathPermissionRevoke { .. } => "path_permission_revoke".to_string(),
            Self::MemberInvite { .. } => "member_invite".to_string(),
            Self::JoinRequest { .. } => "join_request".to_string(),
            Self::VotingConfigChange { .. } => "voting_config_change".to_string(),
            Self::CustomProposal { .. } => "custom_proposal".to_string(),
        }
    }

    /// Returns true if this proposal type can have "recoverable" execution errors
    /// (e.g., user already member, user blacklisted after proposal creation).
    /// These errors mark proposal as ExecutedSkipped rather than propagating the error.
    pub fn has_recoverable_execution_errors(&self) -> bool {
        matches!(self, Self::JoinRequest { .. } | Self::MemberInvite { .. })
    }

    pub fn target(&self, proposer: &AccountId) -> AccountId {
        match self {
            Self::GroupUpdate { .. } => proposer.clone(),
            Self::PermissionChange { target_user, .. } => target_user.clone(),
            Self::PathPermissionGrant { target_user, .. } => target_user.clone(),
            Self::PathPermissionRevoke { target_user, .. } => target_user.clone(),
            Self::MemberInvite { target_user, .. } => target_user.clone(),
            Self::JoinRequest { requester, .. } => requester.clone(),
            Self::VotingConfigChange { .. } => proposer.clone(),
            Self::CustomProposal { .. } => proposer.clone(),
        }
    }
}
