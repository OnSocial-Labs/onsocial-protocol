//! Reusable SOCIAL spend contract for OnSocial social actions.
//!
//! The contract intentionally keeps token rules on-chain and game interpretation
//! event-driven. It accepts SOCIAL via `ft_transfer_call`, validates a small
//! versioned message envelope against an owner/DAO-controlled action registry,
//! routes funds into treasury, season pools, and target balances, then emits
//! canonical events for indexers and apps.

use near_sdk::json_types::{Base58CryptoHash, Base64VecU8, U128};
use near_sdk::store::LookupMap;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError, env, near,
    serde_json,
};
use near_sdk_macros::NearSchema;

const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const BPS_DENOMINATOR: u32 = 10_000;
const SOCIAL_UNIT: u128 = 1_000_000_000_000_000_000;
const MIN_SOCIAL_SPEND: u128 = SOCIAL_UNIT / 100;
const MAX_MSG_BYTES: usize = 4_096;
const MAX_METADATA_BYTES: usize = 1_024;
const MAX_TARGET_ID_BYTES: usize = 256;
const MAX_TAG_BYTES: usize = 32;
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);
const GAS_MIGRATE: Gas = Gas::from_tgas(200);
const FT_STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(2);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum SocialSpendError {
    Unauthorized(String),
    InvalidInput(String),
    InvalidAmount,
    ContractPaused,
    ActionNotFound(String),
    ActionDisabled(String),
    InsufficientBalance(String),
    TransferPending,
    AlreadyClaimed,
    InvalidProof,
}

impl std::fmt::Display for SocialSpendError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::InvalidInput(msg) => write!(f, "Invalid input: {}", msg),
            Self::InvalidAmount => write!(f, "Invalid amount"),
            Self::ContractPaused => write!(f, "Contract paused"),
            Self::ActionNotFound(action) => write!(f, "Action not found: {}", action),
            Self::ActionDisabled(action) => write!(f, "Action disabled: {}", action),
            Self::InsufficientBalance(msg) => write!(f, "Insufficient balance: {}", msg),
            Self::TransferPending => write!(f, "Transfer already pending"),
            Self::AlreadyClaimed => write!(f, "Season reward already claimed"),
            Self::InvalidProof => write!(f, "Invalid proof"),
        }
    }
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    ActionConfigs,
    SeasonConfigs,
    ActionTotals,
    SeasonPools,
    SeasonSettlements,
    SeasonClaims,
    TargetBalances,
    TargetTotals,
    PendingTransfers,
}

#[near(serializers = [json])]
pub struct ActionConfigInput {
    pub label: String,
    pub active: bool,
    pub min_amount: U128,
    pub target_types: Vec<String>,
    pub treasury_bps: u16,
    pub season_pool_bps: u16,
    pub target_bps: u16,
    pub season_required: bool,
    pub allow_self_target: bool,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct ActionConfig {
    pub label: String,
    pub active: bool,
    pub min_amount: u128,
    pub target_types: Vec<String>,
    pub treasury_bps: u16,
    pub season_pool_bps: u16,
    pub target_bps: u16,
    pub season_required: bool,
    pub allow_self_target: bool,
}

impl From<ActionConfigInput> for ActionConfig {
    fn from(input: ActionConfigInput) -> Self {
        Self {
            label: input.label,
            active: input.active,
            min_amount: input.min_amount.0,
            target_types: input.target_types,
            treasury_bps: input.treasury_bps,
            season_pool_bps: input.season_pool_bps,
            target_bps: input.target_bps,
            season_required: input.season_required,
            allow_self_target: input.allow_self_target,
        }
    }
}

#[near(serializers = [json])]
pub struct ActionConfigView {
    pub label: String,
    pub active: bool,
    pub min_amount: U128,
    pub target_types: Vec<String>,
    pub treasury_bps: u16,
    pub season_pool_bps: u16,
    pub target_bps: u16,
    pub season_required: bool,
    pub allow_self_target: bool,
}

impl From<&ActionConfig> for ActionConfigView {
    fn from(config: &ActionConfig) -> Self {
        Self {
            label: config.label.clone(),
            active: config.active,
            min_amount: U128(config.min_amount),
            target_types: config.target_types.clone(),
            treasury_bps: config.treasury_bps,
            season_pool_bps: config.season_pool_bps,
            target_bps: config.target_bps,
            season_required: config.season_required,
            allow_self_target: config.allow_self_target,
        }
    }
}

#[near(serializers = [json])]
pub struct SpendMsg {
    pub v: u8,
    pub app_id: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub season_id: Option<String>,
    pub tag: Option<String>,
    pub recipient_id: Option<AccountId>,
    pub metadata: Option<serde_json::Value>,
}

#[near(serializers = [json])]
pub struct SeasonConfigInput {
    pub label: String,
    pub active: bool,
    pub starts_at_ns: u64,
    pub ends_at_ns: u64,
    pub claim_starts_at_ns: Option<u64>,
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct SeasonConfig {
    pub label: String,
    pub active: bool,
    pub starts_at_ns: u64,
    pub ends_at_ns: u64,
    pub claim_starts_at_ns: Option<u64>,
}

impl From<SeasonConfigInput> for SeasonConfig {
    fn from(input: SeasonConfigInput) -> Self {
        Self {
            label: input.label,
            active: input.active,
            starts_at_ns: input.starts_at_ns,
            ends_at_ns: input.ends_at_ns,
            claim_starts_at_ns: input.claim_starts_at_ns,
        }
    }
}

#[near(serializers = [json])]
pub struct SeasonConfigView {
    pub label: String,
    pub active: bool,
    pub starts_at_ns: u64,
    pub ends_at_ns: u64,
    pub claim_starts_at_ns: Option<u64>,
    pub is_live: bool,
    pub claim_open: bool,
}

impl SeasonConfigView {
    fn from_config(config: &SeasonConfig, now: u64) -> Self {
        let claim_starts_at_ns = config.claim_starts_at_ns.unwrap_or(config.ends_at_ns);
        Self {
            label: config.label.clone(),
            active: config.active,
            starts_at_ns: config.starts_at_ns,
            ends_at_ns: config.ends_at_ns,
            claim_starts_at_ns: config.claim_starts_at_ns,
            is_live: config.active && now >= config.starts_at_ns && now < config.ends_at_ns,
            claim_open: now >= claim_starts_at_ns,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct ActionTotals {
    pub total_spent: u128,
    pub treasury_routed: u128,
    pub season_routed: u128,
    pub target_routed: u128,
    pub count: u64,
}

#[near(serializers = [json])]
pub struct ActionTotalsView {
    pub total_spent: U128,
    pub treasury_routed: U128,
    pub season_routed: U128,
    pub target_routed: U128,
    pub count: u64,
}

impl From<&ActionTotals> for ActionTotalsView {
    fn from(totals: &ActionTotals) -> Self {
        Self {
            total_spent: U128(totals.total_spent),
            treasury_routed: U128(totals.treasury_routed),
            season_routed: U128(totals.season_routed),
            target_routed: U128(totals.target_routed),
            count: totals.count,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone, Default)]
pub struct TargetTotals {
    pub total_spent: u128,
    pub count: u64,
}

#[near(serializers = [json])]
pub struct TargetTotalsView {
    pub total_spent: U128,
    pub count: u64,
}

impl From<&TargetTotals> for TargetTotalsView {
    fn from(totals: &TargetTotals) -> Self {
        Self {
            total_spent: U128(totals.total_spent),
            count: totals.count,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct SeasonSettlement {
    pub root: Vec<u8>,
    pub total_amount: u128,
    pub claimed_amount: u128,
    pub published_at: u64,
    pub active: bool,
}

#[near(serializers = [json])]
pub struct SeasonSettlementView {
    pub root: Base64VecU8,
    pub total_amount: U128,
    pub claimed_amount: U128,
    pub published_at: u64,
    pub active: bool,
}

impl From<&SeasonSettlement> for SeasonSettlementView {
    fn from(settlement: &SeasonSettlement) -> Self {
        Self {
            root: Base64VecU8(settlement.root.clone()),
            total_amount: U128(settlement.total_amount),
            claimed_amount: U128(settlement.claimed_amount),
            published_at: settlement.published_at,
            active: settlement.active,
        }
    }
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub enum PendingTransferKind {
    TargetBalance,
    SeasonReward {
        season_id: String,
        claim_key: String,
    },
    Treasury,
}

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct PendingTransfer {
    pub amount: u128,
    pub kind: PendingTransferKind,
}

#[near(serializers = [json])]
pub struct ContractInfo {
    pub version: String,
    pub owner_id: AccountId,
    pub social_token: AccountId,
    pub treasury_id: AccountId,
    pub settlement_publisher: Option<AccountId>,
    pub paused: bool,
    pub treasury_balance: U128,
    pub total_spent: U128,
    pub action_ids: Vec<String>,
    pub season_ids: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct SocialSpendContract {
    pub version: String,
    pub owner_id: AccountId,
    pub social_token: AccountId,
    pub treasury_id: AccountId,
    pub settlement_publisher: Option<AccountId>,
    pub paused: bool,
    pub treasury_balance: u128,
    pub total_spent: u128,
    pub action_ids: Vec<String>,
    pub season_ids: Vec<String>,
    pub(crate) action_configs: LookupMap<String, ActionConfig>,
    pub(crate) season_configs: LookupMap<String, SeasonConfig>,
    pub(crate) action_totals: LookupMap<String, ActionTotals>,
    pub(crate) season_pools: LookupMap<String, u128>,
    pub(crate) season_settlements: LookupMap<String, SeasonSettlement>,
    pub(crate) season_claims: LookupMap<String, bool>,
    pub(crate) target_balances: LookupMap<AccountId, u128>,
    pub(crate) target_totals: LookupMap<String, TargetTotals>,
    pub(crate) pending_transfers: LookupMap<AccountId, PendingTransfer>,
}

#[near]
impl SocialSpendContract {
    #[init]
    pub fn new(owner_id: AccountId, social_token: AccountId, treasury_id: AccountId) -> Self {
        let mut contract = Self {
            version: CONTRACT_VERSION.to_string(),
            owner_id,
            social_token,
            treasury_id,
            settlement_publisher: None,
            paused: false,
            treasury_balance: 0,
            total_spent: 0,
            action_ids: Vec::new(),
            season_ids: Vec::new(),
            action_configs: LookupMap::new(StorageKey::ActionConfigs),
            season_configs: LookupMap::new(StorageKey::SeasonConfigs),
            action_totals: LookupMap::new(StorageKey::ActionTotals),
            season_pools: LookupMap::new(StorageKey::SeasonPools),
            season_settlements: LookupMap::new(StorageKey::SeasonSettlements),
            season_claims: LookupMap::new(StorageKey::SeasonClaims),
            target_balances: LookupMap::new(StorageKey::TargetBalances),
            target_totals: LookupMap::new(StorageKey::TargetTotals),
            pending_transfers: LookupMap::new(StorageKey::PendingTransfers),
        };
        contract.install_default_actions();
        contract
    }

    #[payable]
    #[handle_result]
    pub fn set_action_config(
        &mut self,
        action_id: String,
        config: ActionConfigInput,
    ) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        self.internal_set_action_config(action_id, config.into())
    }

    #[payable]
    #[handle_result]
    pub fn remove_action_config(&mut self, action_id: String) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        self.validate_slug("action", &action_id, 1, 64)?;
        self.action_configs.remove(&action_id);
        self.action_ids.retain(|id| id != &action_id);
        emit(
            "ACTION_CONFIG_REMOVED",
            &env::predecessor_account_id(),
            serde_json::json!({ "action": action_id }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_season_config(
        &mut self,
        season_id: String,
        config: SeasonConfigInput,
    ) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        self.validate_slug("season_id", &season_id, 1, 64)?;
        let config: SeasonConfig = config.into();
        self.validate_season_config(&config)?;
        if !self.season_configs.contains_key(&season_id) {
            self.season_ids.push(season_id.clone());
        }
        self.season_configs
            .insert(season_id.clone(), config.clone());
        emit(
            "SEASON_CONFIG_SET",
            &env::predecessor_account_id(),
            serde_json::json!({
                "season_id": season_id,
                "label": config.label,
                "active": config.active,
                "starts_at_ns": config.starts_at_ns,
                "ends_at_ns": config.ends_at_ns,
                "claim_starts_at_ns": config.claim_starts_at_ns,
            }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_paused(&mut self, paused: bool) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        self.paused = paused;
        emit(
            "PAUSE_UPDATED",
            &env::predecessor_account_id(),
            serde_json::json!({ "paused": paused }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_treasury_id(&mut self, treasury_id: AccountId) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        let old_treasury_id = self.treasury_id.clone();
        self.treasury_id = treasury_id.clone();
        emit(
            "TREASURY_UPDATED",
            &env::predecessor_account_id(),
            serde_json::json!({
                "old_treasury_id": old_treasury_id,
                "treasury_id": treasury_id,
            }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_settlement_publisher(
        &mut self,
        settlement_publisher: Option<AccountId>,
    ) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        self.settlement_publisher = settlement_publisher.clone();
        emit(
            "SETTLEMENT_PUBLISHER_UPDATED",
            &env::predecessor_account_id(),
            serde_json::json!({ "settlement_publisher": settlement_publisher }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_owner(&mut self, owner_id: AccountId) -> Result<(), SocialSpendError> {
        self.assert_owner_one_yocto()?;
        let old_owner_id = self.owner_id.clone();
        self.owner_id = owner_id.clone();
        emit(
            "OWNER_CHANGED",
            &old_owner_id,
            serde_json::json!({ "owner_id": owner_id }),
        );
        Ok(())
    }

    #[handle_result]
    pub fn update_contract(&self) -> Result<Promise, SocialSpendError> {
        self.assert_owner()?;
        let code = env::input().expect("No input").to_vec();
        Ok(Promise::new(env::current_account_id())
            .deploy_contract(code)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_MIGRATE,
            )
            .as_return())
    }

    #[handle_result]
    pub fn update_contract_from_hash(
        &self,
        code_hash: Base58CryptoHash,
    ) -> Result<Promise, SocialSpendError> {
        self.assert_owner()?;
        Ok(Promise::new(env::current_account_id())
            .use_global_contract(code_hash)
            .function_call(
                "migrate".to_string(),
                vec![],
                NearToken::from_near(0),
                GAS_MIGRATE,
            )
            .as_return())
    }

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut contract: Self = env::state_read().expect("State read failed");
        let old_version = contract.version.clone();
        contract.version = CONTRACT_VERSION.to_string();
        emit(
            "CONTRACT_UPGRADE",
            &contract.owner_id.clone(),
            serde_json::json!({
                "old_version": old_version,
                "new_version": CONTRACT_VERSION,
            }),
        );
        contract
    }

    #[handle_result]
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> Result<U128, SocialSpendError> {
        if env::predecessor_account_id() != self.social_token {
            return Err(SocialSpendError::InvalidInput("Wrong token".into()));
        }
        if self.paused {
            return Err(SocialSpendError::ContractPaused);
        }
        if amount.0 == 0 {
            return Err(SocialSpendError::InvalidAmount);
        }
        if msg.len() > MAX_MSG_BYTES {
            return Err(SocialSpendError::InvalidInput("Message too large".into()));
        }

        let input: SpendMsg = serde_json::from_str(&msg)
            .map_err(|_| SocialSpendError::InvalidInput("Invalid JSON".into()))?;
        self.handle_spend(sender_id, amount.0, input)?;
        Ok(U128(0))
    }

    #[payable]
    #[handle_result]
    pub fn publish_season_root(
        &mut self,
        season_id: String,
        root: Base64VecU8,
        total_amount: U128,
        active: bool,
    ) -> Result<(), SocialSpendError> {
        self.assert_settlement_publisher_one_yocto()?;
        self.validate_slug("season_id", &season_id, 1, 64)?;
        self.assert_season_ready_for_settlement(&season_id)?;
        if root.0.len() != 32 {
            return Err(SocialSpendError::InvalidInput(
                "Root must be 32 bytes".into(),
            ));
        }
        let pool_balance = self.season_pools.get(&season_id).copied().unwrap_or(0);
        if total_amount.0 > pool_balance {
            return Err(SocialSpendError::InsufficientBalance(format!(
                "Season pool has {pool_balance}, root needs {}",
                total_amount.0
            )));
        }
        if let Some(existing) = self.season_settlements.get(&season_id) {
            if existing.claimed_amount > 0 {
                return Err(SocialSpendError::InvalidInput(
                    "Cannot replace settlement after claims".into(),
                ));
            }
        }

        let settlement = SeasonSettlement {
            root: root.0.clone(),
            total_amount: total_amount.0,
            claimed_amount: 0,
            published_at: env::block_timestamp(),
            active,
        };
        self.season_settlements
            .insert(season_id.clone(), settlement);
        emit(
            "SEASON_ROOT_PUBLISHED",
            &env::predecessor_account_id(),
            serde_json::json!({
                "season_id": season_id,
                "root": Base64VecU8(root.0),
                "total_amount": total_amount.0.to_string(),
                "active": active,
            }),
        );
        Ok(())
    }

    #[handle_result]
    pub fn claim_season_reward(
        &mut self,
        season_id: String,
        amount: U128,
        proof: Vec<Base64VecU8>,
    ) -> Result<serde_json::Value, SocialSpendError> {
        if self.paused {
            return Err(SocialSpendError::ContractPaused);
        }
        if amount.0 == 0 {
            return Err(SocialSpendError::InvalidAmount);
        }
        self.validate_slug("season_id", &season_id, 1, 64)?;
        self.assert_season_claim_open(&season_id)?;
        let account_id = env::predecessor_account_id();
        if self.pending_transfers.contains_key(&account_id) {
            return Err(SocialSpendError::TransferPending);
        }

        let mut settlement = self
            .season_settlements
            .get(&season_id)
            .cloned()
            .ok_or_else(|| SocialSpendError::InvalidInput("Season not settled".into()))?;
        if !settlement.active {
            return Err(SocialSpendError::InvalidInput("Settlement inactive".into()));
        }

        let claim_key = Self::season_claim_key(&season_id, &account_id);
        if self.season_claims.contains_key(&claim_key) {
            return Err(SocialSpendError::AlreadyClaimed);
        }
        if !verify_season_proof(&settlement.root, &season_id, &account_id, amount.0, &proof) {
            return Err(SocialSpendError::InvalidProof);
        }

        let pool_balance = self.season_pools.get(&season_id).copied().unwrap_or(0);
        if amount.0 > pool_balance {
            return Err(SocialSpendError::InsufficientBalance(format!(
                "Season pool has {pool_balance}, claim needs {}",
                amount.0
            )));
        }
        if settlement.claimed_amount.saturating_add(amount.0) > settlement.total_amount {
            return Err(SocialSpendError::InsufficientBalance(
                "Settlement amount exhausted".into(),
            ));
        }

        self.season_pools
            .insert(season_id.clone(), pool_balance.saturating_sub(amount.0));
        settlement.claimed_amount = settlement.claimed_amount.saturating_add(amount.0);
        self.season_settlements
            .insert(season_id.clone(), settlement);
        self.season_claims.insert(claim_key.clone(), true);
        self.pending_transfers.insert(
            account_id.clone(),
            PendingTransfer {
                amount: amount.0,
                kind: PendingTransferKind::SeasonReward {
                    season_id: season_id.clone(),
                    claim_key,
                },
            },
        );

        self.transfer_social(&account_id, amount.0);
        Ok(serde_json::json!({
            "status": "pending",
            "season_id": season_id,
            "amount": amount.0.to_string(),
        }))
    }

    #[handle_result]
    pub fn claim_target_balance(
        &mut self,
        amount: Option<U128>,
    ) -> Result<serde_json::Value, SocialSpendError> {
        if self.paused {
            return Err(SocialSpendError::ContractPaused);
        }
        let account_id = env::predecessor_account_id();
        if self.pending_transfers.contains_key(&account_id) {
            return Err(SocialSpendError::TransferPending);
        }

        let available = self.target_balances.get(&account_id).copied().unwrap_or(0);
        let claim_amount = amount.map(|value| value.0).unwrap_or(available);
        if claim_amount == 0 {
            return Err(SocialSpendError::InvalidAmount);
        }
        if claim_amount > available {
            return Err(SocialSpendError::InsufficientBalance(format!(
                "Target balance has {available}, claim needs {claim_amount}"
            )));
        }

        self.target_balances
            .insert(account_id.clone(), available.saturating_sub(claim_amount));
        self.pending_transfers.insert(
            account_id.clone(),
            PendingTransfer {
                amount: claim_amount,
                kind: PendingTransferKind::TargetBalance,
            },
        );
        self.transfer_social(&account_id, claim_amount);
        Ok(serde_json::json!({
            "status": "pending",
            "amount": claim_amount.to_string(),
        }))
    }

    #[payable]
    #[handle_result]
    pub fn withdraw_treasury(
        &mut self,
        amount: U128,
    ) -> Result<serde_json::Value, SocialSpendError> {
        self.assert_treasury_withdrawer_one_yocto()?;
        if self.pending_transfers.contains_key(&self.treasury_id) {
            return Err(SocialSpendError::TransferPending);
        }
        if amount.0 == 0 {
            return Err(SocialSpendError::InvalidAmount);
        }
        if amount.0 > self.treasury_balance {
            return Err(SocialSpendError::InsufficientBalance(format!(
                "Treasury balance has {}, withdrawal needs {}",
                self.treasury_balance, amount.0
            )));
        }

        self.treasury_balance = self.treasury_balance.saturating_sub(amount.0);
        self.pending_transfers.insert(
            self.treasury_id.clone(),
            PendingTransfer {
                amount: amount.0,
                kind: PendingTransferKind::Treasury,
            },
        );
        self.transfer_social(&self.treasury_id, amount.0);
        Ok(serde_json::json!({
            "status": "pending",
            "amount": amount.0.to_string(),
        }))
    }

    #[private]
    pub fn on_transfer_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        account_id: AccountId,
        amount: U128,
    ) {
        let pending = self.pending_transfers.remove(&account_id);
        if call_result.is_ok() {
            emit(
                "SOCIAL_TRANSFERRED",
                &account_id,
                serde_json::json!({ "amount": amount.0.to_string() }),
            );
            return;
        }

        if let Some(pending) = pending {
            self.rollback_transfer(&account_id, pending);
        }
        emit(
            "SOCIAL_TRANSFER_FAILED",
            &account_id,
            serde_json::json!({ "amount": amount.0.to_string() }),
        );
    }

    pub fn get_contract_info(&self) -> ContractInfo {
        ContractInfo {
            version: self.version.clone(),
            owner_id: self.owner_id.clone(),
            social_token: self.social_token.clone(),
            treasury_id: self.treasury_id.clone(),
            settlement_publisher: self.settlement_publisher.clone(),
            paused: self.paused,
            treasury_balance: U128(self.treasury_balance),
            total_spent: U128(self.total_spent),
            action_ids: self.action_ids.clone(),
            season_ids: self.season_ids.clone(),
        }
    }

    pub fn get_action_config(&self, action_id: String) -> Option<ActionConfigView> {
        self.action_configs
            .get(&action_id)
            .map(ActionConfigView::from)
    }

    pub fn get_season_config(&self, season_id: String) -> Option<SeasonConfigView> {
        let now = env::block_timestamp();
        self.season_configs
            .get(&season_id)
            .map(|config| SeasonConfigView::from_config(config, now))
    }

    pub fn get_season_ids(&self) -> Vec<String> {
        self.season_ids.clone()
    }

    pub fn get_action_totals(&self, action_id: String) -> ActionTotalsView {
        self.action_totals
            .get(&action_id)
            .map(ActionTotalsView::from)
            .unwrap_or_else(|| ActionTotalsView::from(&ActionTotals::default()))
    }

    pub fn get_target_totals(&self, target_type: String, target_id: String) -> TargetTotalsView {
        let key = Self::target_key(&target_type, &target_id);
        self.target_totals
            .get(&key)
            .map(TargetTotalsView::from)
            .unwrap_or_else(|| TargetTotalsView::from(&TargetTotals::default()))
    }

    pub fn get_target_balance(&self, account_id: AccountId) -> U128 {
        U128(self.target_balances.get(&account_id).copied().unwrap_or(0))
    }

    pub fn get_season_pool(&self, season_id: String) -> U128 {
        U128(self.season_pools.get(&season_id).copied().unwrap_or(0))
    }

    pub fn get_season_settlement(&self, season_id: String) -> Option<SeasonSettlementView> {
        self.season_settlements
            .get(&season_id)
            .map(SeasonSettlementView::from)
    }

    pub fn has_claimed_season(&self, season_id: String, account_id: AccountId) -> bool {
        self.season_claims
            .contains_key(&Self::season_claim_key(&season_id, &account_id))
    }
}

impl SocialSpendContract {
    fn install_default_actions(&mut self) {
        let defaults = [
            (
                "signal_profile",
                ActionConfig {
                    label: "Signal Profile".into(),
                    active: true,
                    min_amount: MIN_SOCIAL_SPEND,
                    target_types: vec!["profile".into()],
                    treasury_bps: 1_000,
                    season_pool_bps: 0,
                    target_bps: 9_000,
                    season_required: false,
                    allow_self_target: false,
                },
            ),
            (
                "boost_post",
                ActionConfig {
                    label: "Boost Post".into(),
                    active: true,
                    min_amount: MIN_SOCIAL_SPEND,
                    target_types: vec!["post".into()],
                    treasury_bps: 1_000,
                    season_pool_bps: 0,
                    target_bps: 9_000,
                    season_required: false,
                    allow_self_target: true,
                },
            ),
            (
                "endorse_profile",
                ActionConfig {
                    label: "Endorse Profile".into(),
                    active: true,
                    min_amount: MIN_SOCIAL_SPEND,
                    target_types: vec!["profile".into()],
                    treasury_bps: 1_000,
                    season_pool_bps: 0,
                    target_bps: 9_000,
                    season_required: false,
                    allow_self_target: false,
                },
            ),
            (
                "join_rally",
                ActionConfig {
                    label: "Join Rally".into(),
                    active: true,
                    min_amount: MIN_SOCIAL_SPEND,
                    target_types: vec!["rally".into()],
                    treasury_bps: 1_000,
                    season_pool_bps: 9_000,
                    target_bps: 0,
                    season_required: true,
                    allow_self_target: true,
                },
            ),
            (
                "support_profile",
                ActionConfig {
                    label: "Support Profile".into(),
                    active: true,
                    min_amount: MIN_SOCIAL_SPEND,
                    target_types: vec!["profile".into()],
                    treasury_bps: 500,
                    season_pool_bps: 0,
                    target_bps: 9_500,
                    season_required: false,
                    allow_self_target: false,
                },
            ),
        ];

        for (action_id, config) in defaults {
            self.internal_set_action_config(action_id.to_string(), config)
                .expect("default action config must be valid");
        }
    }

    fn internal_set_action_config(
        &mut self,
        action_id: String,
        config: ActionConfig,
    ) -> Result<(), SocialSpendError> {
        self.validate_slug("action", &action_id, 1, 64)?;
        self.validate_action_config(&config)?;
        if !self.action_configs.contains_key(&action_id) {
            self.action_ids.push(action_id.clone());
        }
        self.action_configs.insert(action_id.clone(), config);
        emit(
            "ACTION_CONFIG_SET",
            &env::predecessor_account_id(),
            serde_json::json!({ "action": action_id }),
        );
        Ok(())
    }

    fn handle_spend(
        &mut self,
        sender_id: AccountId,
        amount: u128,
        input: SpendMsg,
    ) -> Result<(), SocialSpendError> {
        if input.v != 1 {
            return Err(SocialSpendError::InvalidInput(
                "Unsupported msg version".into(),
            ));
        }
        self.validate_slug("app_id", &input.app_id, 1, 64)?;
        self.validate_slug("action", &input.action, 1, 64)?;
        self.validate_slug("target_type", &input.target_type, 1, 64)?;
        self.validate_target_id(&input.target_id)?;
        if let Some(tag) = input.tag.as_deref() {
            self.validate_slug("tag", tag, 1, MAX_TAG_BYTES)?;
        }
        if let Some(metadata) = input.metadata.as_ref() {
            let bytes = serde_json::to_vec(metadata)
                .map_err(|_| SocialSpendError::InvalidInput("Invalid metadata".into()))?;
            if bytes.len() > MAX_METADATA_BYTES {
                return Err(SocialSpendError::InvalidInput("Metadata too large".into()));
            }
        }

        let config = self
            .action_configs
            .get(&input.action)
            .cloned()
            .ok_or_else(|| SocialSpendError::ActionNotFound(input.action.clone()))?;
        if !config.active {
            return Err(SocialSpendError::ActionDisabled(input.action.clone()));
        }
        if amount < config.min_amount {
            return Err(SocialSpendError::InvalidAmount);
        }
        if !config
            .target_types
            .iter()
            .any(|target_type| target_type == &input.target_type)
        {
            return Err(SocialSpendError::InvalidInput(
                "Target type not allowed for action".into(),
            ));
        }

        let season_id = match input.season_id.as_deref() {
            Some(season_id) => {
                self.validate_slug("season_id", season_id, 1, 64)?;
                self.assert_season_open_for_spend(season_id)?;
                Some(season_id.to_string())
            }
            None if config.season_required || config.season_pool_bps > 0 => {
                return Err(SocialSpendError::InvalidInput("season_id required".into()));
            }
            None => None,
        };
        let recipient_id = self.resolve_recipient(&sender_id, &input, &config)?;

        let target_amount =
            amount.saturating_mul(config.target_bps as u128) / BPS_DENOMINATOR as u128;
        let season_amount =
            amount.saturating_mul(config.season_pool_bps as u128) / BPS_DENOMINATOR as u128;
        let treasury_amount = amount
            .saturating_sub(target_amount)
            .saturating_sub(season_amount);

        self.total_spent = self.total_spent.saturating_add(amount);
        self.treasury_balance = self.treasury_balance.saturating_add(treasury_amount);

        if let Some(season_id) = season_id.as_ref() {
            let current = self.season_pools.get(season_id).copied().unwrap_or(0);
            self.season_pools
                .insert(season_id.clone(), current.saturating_add(season_amount));
        }
        if let Some(recipient_id) = recipient_id.as_ref() {
            let current = self.target_balances.get(recipient_id).copied().unwrap_or(0);
            self.target_balances
                .insert(recipient_id.clone(), current.saturating_add(target_amount));
        }

        let mut action_totals = self
            .action_totals
            .get(&input.action)
            .cloned()
            .unwrap_or_default();
        action_totals.total_spent = action_totals.total_spent.saturating_add(amount);
        action_totals.treasury_routed = action_totals
            .treasury_routed
            .saturating_add(treasury_amount);
        action_totals.season_routed = action_totals.season_routed.saturating_add(season_amount);
        action_totals.target_routed = action_totals.target_routed.saturating_add(target_amount);
        action_totals.count = action_totals.count.saturating_add(1);
        self.action_totals
            .insert(input.action.clone(), action_totals);

        let target_key = Self::target_key(&input.target_type, &input.target_id);
        let mut target_totals = self
            .target_totals
            .get(&target_key)
            .cloned()
            .unwrap_or_default();
        target_totals.total_spent = target_totals.total_spent.saturating_add(amount);
        target_totals.count = target_totals.count.saturating_add(1);
        self.target_totals.insert(target_key, target_totals);

        let mut event = serde_json::json!({
            "spender_id": sender_id,
            "amount": amount.to_string(),
            "app_id": input.app_id,
            "action": input.action,
            "target_type": input.target_type,
            "target_id": input.target_id,
            "treasury_amount": treasury_amount.to_string(),
            "season_amount": season_amount.to_string(),
            "target_amount": target_amount.to_string(),
        });
        if let Some(season_id) = season_id {
            event["season_id"] = serde_json::json!(season_id);
        }
        if let Some(tag) = input.tag {
            event["tag"] = serde_json::json!(tag);
        }
        if let Some(recipient_id) = recipient_id {
            event["recipient_id"] = serde_json::json!(recipient_id);
        }
        if let Some(metadata) = input.metadata {
            event["metadata"] = metadata;
        }
        emit("SOCIAL_SPENT", &sender_id, event);
        Ok(())
    }

    fn validate_action_config(&self, config: &ActionConfig) -> Result<(), SocialSpendError> {
        self.validate_label(&config.label)?;
        if config.min_amount == 0 {
            return Err(SocialSpendError::InvalidInput(
                "min_amount must be positive".into(),
            ));
        }
        if config.target_types.is_empty() {
            return Err(SocialSpendError::InvalidInput(
                "target_types required".into(),
            ));
        }
        for target_type in &config.target_types {
            self.validate_slug("target_type", target_type, 1, 64)?;
        }
        let total_bps = u32::from(config.treasury_bps)
            + u32::from(config.season_pool_bps)
            + u32::from(config.target_bps);
        if total_bps != BPS_DENOMINATOR {
            return Err(SocialSpendError::InvalidInput(
                "routing bps must sum to 10000".into(),
            ));
        }
        Ok(())
    }

    fn validate_season_config(&self, config: &SeasonConfig) -> Result<(), SocialSpendError> {
        self.validate_label(&config.label)?;
        if config.starts_at_ns >= config.ends_at_ns {
            return Err(SocialSpendError::InvalidInput(
                "starts_at_ns must be before ends_at_ns".into(),
            ));
        }
        if let Some(claim_starts_at_ns) = config.claim_starts_at_ns {
            if claim_starts_at_ns < config.ends_at_ns {
                return Err(SocialSpendError::InvalidInput(
                    "claim_starts_at_ns must be at or after ends_at_ns".into(),
                ));
            }
        }
        Ok(())
    }

    fn require_season_config(&self, season_id: &str) -> Result<SeasonConfig, SocialSpendError> {
        self.season_configs
            .get(season_id)
            .cloned()
            .ok_or_else(|| SocialSpendError::InvalidInput("Season not configured".into()))
    }

    fn assert_season_open_for_spend(&self, season_id: &str) -> Result<(), SocialSpendError> {
        let config = self.require_season_config(season_id)?;
        if !config.active {
            return Err(SocialSpendError::InvalidInput("Season inactive".into()));
        }
        let now = env::block_timestamp();
        if now < config.starts_at_ns {
            return Err(SocialSpendError::InvalidInput("Season not started".into()));
        }
        if now >= config.ends_at_ns {
            return Err(SocialSpendError::InvalidInput("Season ended".into()));
        }
        Ok(())
    }

    fn assert_season_ready_for_settlement(&self, season_id: &str) -> Result<(), SocialSpendError> {
        let config = self.require_season_config(season_id)?;
        if env::block_timestamp() < config.ends_at_ns {
            return Err(SocialSpendError::InvalidInput("Season not ended".into()));
        }
        Ok(())
    }

    fn assert_season_claim_open(&self, season_id: &str) -> Result<(), SocialSpendError> {
        let config = self.require_season_config(season_id)?;
        let claim_starts_at_ns = config.claim_starts_at_ns.unwrap_or(config.ends_at_ns);
        if env::block_timestamp() < claim_starts_at_ns {
            return Err(SocialSpendError::InvalidInput("Claims not open".into()));
        }
        Ok(())
    }

    fn resolve_recipient(
        &self,
        sender_id: &AccountId,
        input: &SpendMsg,
        config: &ActionConfig,
    ) -> Result<Option<AccountId>, SocialSpendError> {
        if config.target_bps == 0 {
            return Ok(None);
        }
        let recipient_id = match input.recipient_id.clone() {
            Some(recipient_id) => recipient_id,
            None if input.target_type == "profile" => input.target_id.parse().map_err(|_| {
                SocialSpendError::InvalidInput("Profile target_id must be an account".into())
            })?,
            None => {
                return Err(SocialSpendError::InvalidInput(
                    "recipient_id required for target split".into(),
                ));
            }
        };
        if !config.allow_self_target && &recipient_id == sender_id {
            return Err(SocialSpendError::InvalidInput(
                "Self target not allowed".into(),
            ));
        }
        Ok(Some(recipient_id))
    }

    fn transfer_social(&self, receiver_id: &AccountId, amount: u128) {
        let _ = Promise::new(self.social_token.clone())
            .function_call(
                "storage_deposit".to_string(),
                serde_json::json!({
                    "account_id": receiver_id,
                    "registration_only": true
                })
                .to_string()
                .into_bytes(),
                FT_STORAGE_DEPOSIT,
                GAS_STORAGE_DEPOSIT,
            )
            .function_call(
                "ft_transfer".to_string(),
                serde_json::json!({ "receiver_id": receiver_id, "amount": U128(amount) })
                    .to_string()
                    .into_bytes(),
                ONE_YOCTO,
                GAS_FT_TRANSFER,
            )
            .then(
                Promise::new(env::current_account_id()).function_call(
                    "on_transfer_callback".to_string(),
                    serde_json::json!({ "account_id": receiver_id, "amount": U128(amount) })
                        .to_string()
                        .into_bytes(),
                    NearToken::from_yoctonear(0),
                    GAS_CALLBACK,
                ),
            );
    }

    fn rollback_transfer(&mut self, account_id: &AccountId, pending: PendingTransfer) {
        match pending.kind {
            PendingTransferKind::TargetBalance => {
                let current = self.target_balances.get(account_id).copied().unwrap_or(0);
                self.target_balances
                    .insert(account_id.clone(), current.saturating_add(pending.amount));
            }
            PendingTransferKind::SeasonReward {
                season_id,
                claim_key,
            } => {
                let current = self.season_pools.get(&season_id).copied().unwrap_or(0);
                self.season_pools
                    .insert(season_id.clone(), current.saturating_add(pending.amount));
                if let Some(mut settlement) = self.season_settlements.get(&season_id).cloned() {
                    settlement.claimed_amount =
                        settlement.claimed_amount.saturating_sub(pending.amount);
                    self.season_settlements.insert(season_id, settlement);
                }
                self.season_claims.remove(&claim_key);
            }
            PendingTransferKind::Treasury => {
                self.treasury_balance = self.treasury_balance.saturating_add(pending.amount);
            }
        }
    }

    fn assert_owner_one_yocto(&self) -> Result<(), SocialSpendError> {
        self.assert_one_yocto()?;
        self.assert_owner()
    }

    fn assert_owner(&self) -> Result<(), SocialSpendError> {
        if env::predecessor_account_id() != self.owner_id {
            return Err(SocialSpendError::Unauthorized("Only owner".into()));
        }
        Ok(())
    }

    fn assert_settlement_publisher_one_yocto(&self) -> Result<(), SocialSpendError> {
        self.assert_one_yocto()?;
        let caller = env::predecessor_account_id();
        if caller == self.owner_id || self.settlement_publisher.as_ref() == Some(&caller) {
            Ok(())
        } else {
            Err(SocialSpendError::Unauthorized(
                "Only owner or settlement publisher".into(),
            ))
        }
    }

    fn assert_treasury_withdrawer_one_yocto(&self) -> Result<(), SocialSpendError> {
        self.assert_one_yocto()?;
        let caller = env::predecessor_account_id();
        if caller == self.owner_id || caller == self.treasury_id {
            Ok(())
        } else {
            Err(SocialSpendError::Unauthorized(
                "Only owner or treasury".into(),
            ))
        }
    }

    fn assert_one_yocto(&self) -> Result<(), SocialSpendError> {
        if env::attached_deposit().as_yoctonear() == 1 {
            Ok(())
        } else {
            Err(SocialSpendError::InvalidInput("Attach 1 yoctoNEAR".into()))
        }
    }

    fn validate_label(&self, label: &str) -> Result<(), SocialSpendError> {
        if label.is_empty() || label.len() > 64 || label.chars().any(|c| c.is_control()) {
            return Err(SocialSpendError::InvalidInput("Invalid label".into()));
        }
        Ok(())
    }

    fn validate_slug(
        &self,
        field: &str,
        value: &str,
        min_len: usize,
        max_len: usize,
    ) -> Result<(), SocialSpendError> {
        let len = value.len();
        if len < min_len || len > max_len {
            return Err(SocialSpendError::InvalidInput(format!(
                "{field} length invalid"
            )));
        }
        if !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.')
        {
            return Err(SocialSpendError::InvalidInput(format!(
                "{field} has invalid characters"
            )));
        }
        Ok(())
    }

    fn validate_target_id(&self, value: &str) -> Result<(), SocialSpendError> {
        if value.is_empty() || value.len() > MAX_TARGET_ID_BYTES {
            return Err(SocialSpendError::InvalidInput(
                "target_id length invalid".into(),
            ));
        }
        if value.chars().any(|c| c.is_control()) {
            return Err(SocialSpendError::InvalidInput(
                "target_id has invalid characters".into(),
            ));
        }
        Ok(())
    }

    fn target_key(target_type: &str, target_id: &str) -> String {
        format!("{}:{}", target_type, target_id)
    }

    fn season_claim_key(season_id: &str, account_id: &AccountId) -> String {
        format!("{}:{}", season_id, account_id)
    }
}

fn emit(event: &str, account_id: &AccountId, mut data: serde_json::Value) {
    if let serde_json::Value::Object(ref mut map) = data {
        map.insert(
            "account_id".into(),
            serde_json::json!(account_id.to_string()),
        );
    }
    let log = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [data],
    });
    env::log_str(&format!("EVENT_JSON:{}", log));
}

fn season_leaf_hash(season_id: &str, account_id: &AccountId, amount: u128) -> [u8; 32] {
    env::sha256_array(
        format!("onsocial-season-v1:{}:{}:{}", season_id, account_id, amount).as_bytes(),
    )
}

fn sorted_pair_hash(left: &[u8; 32], right: &[u8; 32]) -> [u8; 32] {
    let mut bytes = Vec::with_capacity(64);
    if left <= right {
        bytes.extend_from_slice(left);
        bytes.extend_from_slice(right);
    } else {
        bytes.extend_from_slice(right);
        bytes.extend_from_slice(left);
    }
    env::sha256_array(&bytes)
}

fn verify_season_proof(
    root: &[u8],
    season_id: &str,
    account_id: &AccountId,
    amount: u128,
    proof: &[Base64VecU8],
) -> bool {
    if root.len() != 32 {
        return false;
    }
    let mut hash = season_leaf_hash(season_id, account_id, amount);
    for item in proof {
        if item.0.len() != 32 {
            return false;
        }
        let mut sibling = [0_u8; 32];
        sibling.copy_from_slice(&item.0);
        hash = sorted_pair_hash(&hash, &sibling);
    }
    hash.as_slice() == root
}

#[cfg(test)]
mod tests;
