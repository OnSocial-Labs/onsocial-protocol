use near_sdk::{AccountId, PublicKey};
use near_sdk::json_types::U64;
use near_sdk::serde_json::Value;

pub use crate::protocol::Auth;

/// All contract actions that can be executed with unified auth.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde", tag = "type", rename_all = "snake_case")]
pub enum Action {
    // ─────────────────────────────────────────────────────────────
    // KV Operations
    // ─────────────────────────────────────────────────────────────
    Set {
        data: Value,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Lifecycle
    // ─────────────────────────────────────────────────────────────
    CreateGroup {
        group_id: String,
        config: Value,
    },
    JoinGroup {
        group_id: String,
    },
    LeaveGroup {
        group_id: String,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Membership Management
    // ─────────────────────────────────────────────────────────────
    AddGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    RemoveGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    ApproveJoinRequest {
        group_id: String,
        requester_id: AccountId,
    },
    RejectJoinRequest {
        group_id: String,
        requester_id: AccountId,
        reason: Option<String>,
    },
    CancelJoinRequest {
        group_id: String,
    },
    BlacklistGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    UnblacklistGroupMember {
        group_id: String,
        member_id: AccountId,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Governance
    // ─────────────────────────────────────────────────────────────
    TransferGroupOwnership {
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
    },
    SetGroupPrivacy {
        group_id: String,
        is_private: bool,
    },
    CreateProposal {
        group_id: String,
        proposal_type: String,
        changes: Value,
        auto_vote: Option<bool>,
    },
    VoteOnProposal {
        group_id: String,
        proposal_id: String,
        approve: bool,
    },
    CancelProposal {
        group_id: String,
        proposal_id: String,
    },

    // ─────────────────────────────────────────────────────────────
    // Permission Operations
    // ─────────────────────────────────────────────────────────────
    SetPermission {
        grantee: AccountId,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    },
    SetKeyPermission {
        public_key: PublicKey,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    },
}

/// Unified request for all authenticated operations.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct ExecuteRequest {
    /// Target account namespace (defaults to actor for Direct auth).
    pub target_account: Option<AccountId>,
    /// The action to perform.
    pub action: Action,
    /// Auth mode (defaults to Direct).
    pub auth: Option<Auth>,
    /// Common options.
    pub options: Option<ExecuteOptions>,
}

/// Options for execute.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Default,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct ExecuteOptions {
    /// If true, refund unused attached deposit to deposit_owner.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}

impl Action {
    /// Returns a string identifier for logging/events.
    pub fn action_type(&self) -> &'static str {
        match self {
            Self::Set { .. } => "set",
            Self::CreateGroup { .. } => "create_group",
            Self::JoinGroup { .. } => "join_group",
            Self::LeaveGroup { .. } => "leave_group",
            Self::AddGroupMember { .. } => "add_group_member",
            Self::RemoveGroupMember { .. } => "remove_group_member",
            Self::ApproveJoinRequest { .. } => "approve_join_request",
            Self::RejectJoinRequest { .. } => "reject_join_request",
            Self::CancelJoinRequest { .. } => "cancel_join_request",
            Self::BlacklistGroupMember { .. } => "blacklist_group_member",
            Self::UnblacklistGroupMember { .. } => "unblacklist_group_member",
            Self::TransferGroupOwnership { .. } => "transfer_group_ownership",
            Self::SetGroupPrivacy { .. } => "set_group_privacy",
            Self::CreateProposal { .. } => "create_proposal",
            Self::VoteOnProposal { .. } => "vote_on_proposal",
            Self::CancelProposal { .. } => "cancel_proposal",
            Self::SetPermission { .. } => "set_permission",
            Self::SetKeyPermission { .. } => "set_key_permission",
        }
    }
}
