//! Protocol types for the marketplace unified execute API.

use near_sdk::json_types::U128;
use near_sdk::{near, AccountId};

/// Re-export the shared Auth enum from onsocial-auth.
pub use onsocial_auth::Auth;

/// Nonce storage prefix — distinct from core-onsocial (0x05).
pub const NONCE_PREFIX: u8 = 0x06;

/// Domain prefix for signed-payload verification.
pub const DOMAIN_PREFIX: &str = "onsocial:marketplace";

/// Marketplace actions dispatched via the unified execute API.
///
/// Actions that require attached NEAR payment (buying, minting) remain
/// as separate `#[payable]` methods — they cannot work through a gasless
/// relayer flow.  Everything else goes through `execute()`.
#[near(serializers = [json])]
#[serde(tag = "type", rename_all = "snake_case")]
#[derive(Clone)]
pub enum Action {
    // ── Collections ──────────────────────────────────────────────
    CreateCollection {
        collection_id: String,
        total_supply: u32,
        metadata_template: String,
        price_near: U128,
        start_time: Option<u64>,
        end_time: Option<u64>,
    },
    UpdateCollectionPrice {
        collection_id: String,
        new_price_near: U128,
    },
    UpdateCollectionTiming {
        collection_id: String,
        start_time: Option<u64>,
        end_time: Option<u64>,
    },

    // ── Listing (external Scarces) ──────────────────────────────────
    ListScarce {
        scarce_contract_id: AccountId,
        token_id: String,
        approval_id: u64,
        sale_conditions: U128,
        expires_at: Option<u64>,
    },
    DelistScarce {
        scarce_contract_id: AccountId,
        token_id: String,
    },
    UpdatePrice {
        scarce_contract_id: AccountId,
        token_id: String,
        price: U128,
    },

    // ── Transfers (native scarces, NEP-171) ──────────────────────
    TransferScarce {
        receiver_id: AccountId,
        token_id: String,
        memo: Option<String>,
    },

    // ── Approvals (NEP-178) ──────────────────────────────────────
    ApproveScarce {
        token_id: String,
        account_id: AccountId,
        msg: Option<String>,
    },
    RevokeScarce {
        token_id: String,
        account_id: AccountId,
    },
    RevokeAllScarce {
        token_id: String,
    },

    // ── Admin ────────────────────────────────────────────────────
    SetFeeRecipient {
        fee_recipient: AccountId,
    },
    UpdateFeeConfig {
        total_fee_bps: Option<u16>,
        sponsor_split_bps: Option<u16>,
        sponsor_fund_cap: Option<U128>,
        max_sponsored_per_user: Option<U128>,
    },
}

impl Action {
    /// Returns a string identifier for logging/events.
    pub fn action_type(&self) -> &'static str {
        match self {
            Self::CreateCollection { .. } => "create_collection",
            Self::UpdateCollectionPrice { .. } => "update_collection_price",
            Self::UpdateCollectionTiming { .. } => "update_collection_timing",
            Self::ListScarce { .. } => "list_scarce",
            Self::DelistScarce { .. } => "delist_scarce",
            Self::UpdatePrice { .. } => "update_price",
            Self::TransferScarce { .. } => "transfer_scarce",
            Self::ApproveScarce { .. } => "approve_scarce",
            Self::RevokeScarce { .. } => "revoke_scarce",
            Self::RevokeAllScarce { .. } => "revoke_all_scarce",
            Self::SetFeeRecipient { .. } => "set_fee_recipient",
            Self::UpdateFeeConfig { .. } => "update_fee_config",
        }
    }
}

/// Incoming request envelope (mirrors core-onsocial pattern).
#[near(serializers = [json])]
#[derive(Clone)]
pub struct Request {
    /// Defaults to actor for `Auth::Direct`.
    pub target_account: Option<AccountId>,
    pub action: Action,
    /// Defaults to `Auth::Direct`.
    pub auth: Option<Auth>,
    pub options: Option<Options>,
}

/// Execute options.
#[near(serializers = [json])]
#[derive(Default, Clone)]
pub struct Options {
    /// Refund unused deposit to payer instead of crediting actor's storage.
    #[serde(default)]
    pub refund_unused_deposit: bool,
}
