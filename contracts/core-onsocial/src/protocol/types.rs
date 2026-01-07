//! Unified protocol types for all contract operations.
//!
//! This module defines the core API types:
//! - `Auth`: Authentication mode (Direct, SignedPayload, DelegateAction, Intent)
//! - `Action`: All operations that can be performed
//! - `Request`: Unified request structure
//! - `Options`: Common operation options

use near_sdk::{AccountId, PublicKey};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::Value;

// ─────────────────────────────────────────────────────────────────────────────
// Authentication
// ─────────────────────────────────────────────────────────────────────────────

/// Authentication mode for contract operations.
///
/// Supports 4 modes to enable gasless transactions and relayer integration:
/// - `Direct`: Standard NEAR transaction (predecessor == actor)
/// - `SignedPayload`: Off-chain signed payload verified on-chain
/// - `DelegateAction`: NEP-366 meta-transactions
/// - `Intent`: Cross-chain intents via solver network
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde", tag = "type", rename_all = "snake_case")]
pub enum Auth {
    /// Standard NEAR transaction - predecessor is the actor.
    Direct,
    /// Off-chain signed payload for gasless UX.
    SignedPayload {
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
    },
    /// NEP-366 meta-transaction.
    DelegateAction {
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
        action: Value,
    },
    /// Cross-chain intent via solver network.
    Intent {
        actor_id: AccountId,
        intent: Value,
    },
}

impl Default for Auth {
    fn default() -> Self {
        Self::Direct
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

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
    /// Write data to the key-value store.
    Set {
        data: Value,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Lifecycle
    // ─────────────────────────────────────────────────────────────
    /// Create a new group.
    CreateGroup {
        group_id: String,
        config: Value,
    },
    /// Request to join a group.
    JoinGroup {
        group_id: String,
    },
    /// Leave a group.
    LeaveGroup {
        group_id: String,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Membership Management
    // ─────────────────────────────────────────────────────────────
    /// Add a member to a group (admin only).
    AddGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    /// Remove a member from a group (admin only).
    RemoveGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    /// Approve a pending join request.
    ApproveJoinRequest {
        group_id: String,
        requester_id: AccountId,
    },
    /// Reject a pending join request.
    RejectJoinRequest {
        group_id: String,
        requester_id: AccountId,
        reason: Option<String>,
    },
    /// Cancel own pending join request.
    CancelJoinRequest {
        group_id: String,
    },
    /// Blacklist a member from rejoining.
    BlacklistGroupMember {
        group_id: String,
        member_id: AccountId,
    },
    /// Remove a member from the blacklist.
    UnblacklistGroupMember {
        group_id: String,
        member_id: AccountId,
    },

    // ─────────────────────────────────────────────────────────────
    // Group Governance
    // ─────────────────────────────────────────────────────────────
    /// Transfer group ownership.
    TransferGroupOwnership {
        group_id: String,
        new_owner: AccountId,
        remove_old_owner: Option<bool>,
    },
    /// Set group privacy (public/private).
    SetGroupPrivacy {
        group_id: String,
        is_private: bool,
    },
    /// Create a governance proposal.
    CreateProposal {
        group_id: String,
        proposal_type: String,
        changes: Value,
        auto_vote: Option<bool>,
    },
    /// Vote on a proposal.
    VoteOnProposal {
        group_id: String,
        proposal_id: String,
        approve: bool,
    },
    /// Cancel a proposal (creator only).
    CancelProposal {
        group_id: String,
        proposal_id: String,
    },

    // ─────────────────────────────────────────────────────────────
    // Permission Operations
    // ─────────────────────────────────────────────────────────────
    /// Grant account-based permission.
    SetPermission {
        grantee: AccountId,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    },
    /// Grant key-based permission.
    SetKeyPermission {
        public_key: PublicKey,
        path: String,
        level: u8,
        expires_at: Option<U64>,
    },
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

// ─────────────────────────────────────────────────────────────────────────────
// Request & Options
// ─────────────────────────────────────────────────────────────────────────────

/// Unified request for all authenticated operations.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct Request {
    /// Target account namespace (defaults to actor for Direct auth).
    pub target_account: Option<AccountId>,
    /// The action to perform.
    pub action: Action,
    /// Auth mode (defaults to Direct).
    pub auth: Option<Auth>,
    /// Common options.
    pub options: Option<Options>,
}

/// Options for execute operations.
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Default,
    Clone,
)]
#[serde(crate = "near_sdk::serde")]
pub struct Options {
    /// If true, refund unused attached deposit to deposit_owner.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
