//! Types for the unified execute API.

use near_sdk::json_types::U64;
use near_sdk::serde_json::Value;
use near_sdk::{AccountId, PublicKey};

/// Actions dispatched via `execute` and `execute_admin`.
#[derive(near_sdk_macros::NearSchema, serde::Serialize, serde::Deserialize, Clone)]
#[serde(crate = "near_sdk::serde", tag = "type", rename_all = "snake_case")]
pub enum Action {
    Set {
        data: Value,
    },

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
        /// Optional rationale.
        description: Option<String>,
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
    /// Finalizes a proposal that has timed out without passing.
    ExpireProposal {
        group_id: String,
        proposal_id: String,
    },

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

impl Action {
    /// Stable identifier used in logs and events.
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
            Self::ExpireProposal { .. } => "expire_proposal",
            Self::SetPermission { .. } => "set_permission",
            Self::SetKeyPermission { .. } => "set_key_permission",
        }
    }

    /// Returns true for actions that must not pass through `execute()`.
    pub fn requires_full_access(&self) -> bool {
        match self {
            Self::SetPermission { .. } | Self::SetKeyPermission { .. } => true,

            Self::Set { data } => set_data_requires_full_access(data),

            _ => false,
        }
    }
}

/// Returns true when a `Set.data` payload includes a reserved operation key.
fn set_data_requires_full_access(data: &Value) -> bool {
    let Some(obj) = data.as_object() else {
        return false;
    };

    obj.keys().any(|k| {
        crate::protocol::operation::classify_api_operation_key(k.as_str())
            .map(|op| op.requires_target_owner())
            .unwrap_or(false)
    })
}

#[derive(near_sdk_macros::NearSchema, serde::Serialize, serde::Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Request {
    /// Defaults to the caller.
    pub target_account: Option<AccountId>,
    pub action: Action,
    pub options: Option<Options>,
}

#[derive(near_sdk_macros::NearSchema, serde::Serialize, serde::Deserialize, Default, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Options {
    /// Refund unused deposit to the payer instead of saving it to actor storage.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
