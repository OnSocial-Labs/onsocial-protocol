use near_sdk::AccountId;
use near_sdk::json_types::U128;
use near_sdk::near;

/// Who may create collections under an app.
///
/// - `open` — any account (default; legacy `curated = false`)
/// - `approval` — owner, moderators, or `approved_creators`
/// - `invite_only` — owner or moderators only (legacy `curated = true`)
#[near(serializers = [borsh, json])]
#[serde(rename_all = "snake_case")]
#[derive(Copy, Clone, Debug, PartialEq, Eq, Default)]
pub enum CreatorAccess {
    #[default]
    Open,
    Approval,
    InviteOnly,
}

impl CreatorAccess {
    /// Stable snake_case tag mirrored in events + indexer (`open`/`approval`/`invite_only`).
    pub fn as_str(&self) -> &'static str {
        match self {
            CreatorAccess::Open => "open",
            CreatorAccess::Approval => "approval",
            CreatorAccess::InviteOnly => "invite_only",
        }
    }
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct AppPool {
    pub owner_id: AccountId,
    pub balance: U128,
    pub used_bytes: u64,
    pub max_user_bytes: u64,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: u16,
    #[serde(default)]
    pub moderators: Vec<AccountId>,
    /// Legacy gate — kept for Borsh layout / old readers. Prefer `creator_access`.
    #[serde(default)]
    pub curated: bool,
    #[serde(default)]
    pub metadata: Option<String>,
    /// Explicit creator access mode. Trailing for upgrade; EOF → Open, then
    /// [`AppPool::effective_creator_access`] may map legacy `curated`.
    #[serde(default)]
    #[borsh(deserialize_with = "crate::deserialize_trailing_creator_access")]
    pub creator_access: CreatorAccess,
    /// Accounts allowed to create when `creator_access` is `approval`.
    #[serde(default)]
    #[borsh(deserialize_with = "crate::deserialize_trailing_account_vec")]
    pub approved_creators: Vec<AccountId>,
}

impl AppPool {
    /// Resolve access, mapping legacy `curated` when `creator_access` was never set.
    pub fn effective_creator_access(&self) -> CreatorAccess {
        match self.creator_access {
            CreatorAccess::Open if self.curated => CreatorAccess::InviteOnly,
            other => other,
        }
    }

    pub fn is_approved_creator(&self, account_id: &AccountId) -> bool {
        self.approved_creators.contains(account_id)
    }

    /// Owner, moderator, or approved creator (approval mode roster).
    pub fn can_create_collection(&self, creator_id: &AccountId) -> bool {
        if creator_id == &self.owner_id || self.moderators.contains(creator_id) {
            return true;
        }
        match self.effective_creator_access() {
            CreatorAccess::Open => true,
            CreatorAccess::Approval => self.is_approved_creator(creator_id),
            CreatorAccess::InviteOnly => false,
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Default)]
pub struct AppConfig {
    pub max_user_bytes: Option<u64>,
    pub default_royalty: Option<std::collections::HashMap<AccountId, u32>>,
    pub primary_sale_bps: Option<u16>,
    /// Legacy alias: `true` → invite_only, `false` → open (unless `creator_access` set).
    pub curated: Option<bool>,
    pub metadata: Option<String>,
    pub creator_access: Option<CreatorAccess>,
}
