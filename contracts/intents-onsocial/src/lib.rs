//! Oracle-settled social bounty contract.

use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    PromiseOrValue, PublicKey, env, ext_contract,
    json_types::{U64, U128},
    near, serde_json,
    store::IterableMap,
};
use near_sdk_macros::NearSchema;

mod oracle;
pub use oracle::OracleAuth;
use oracle::{authenticate_oracle, nonce::record as record_nonce};

#[ext_contract(ext_ft)]
pub trait FungibleToken {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

const GAS_CALLBACK: Gas = Gas::from_tgas(15);
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_MIGRATE: Gas = Gas::from_tgas(200);
/// Storage reserve per offer.
const STORAGE_PER_OFFER: u128 = 5_000_000_000_000_000_000_000; // 0.005 NEAR
const MIN_BOUNTY_YOCTO: u128 = 10_000_000_000_000_000_000_000; // 0.01 NEAR
const MAX_BOUNTY_YOCTO: u128 = 100_000_000_000_000_000_000_000_000; // 100 NEAR
const MIN_DEADLINE_NS: u64 = 60 * 1_000_000_000; // 60s minimum from now
const MAX_DEADLINE_NS: u64 = 30 * 24 * 60 * 60 * 1_000_000_000; // 30 days
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";

const MAX_ORACLE_PKS: usize = 50;
const MAX_ACCEPTED_FTS: usize = 20;
/// Storage prefix for oracle nonces.
const NONCE_PREFIX: u8 = 0xA0;
/// Domain prefix for oracle attestations.
const DOMAIN_PREFIX: &str = "onsocial:intent";

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum IntentError {
    Unauthorized(String),
    InvalidInput(String),
    NotFound,
    NotOpen,
    DeadlineNotReached,
    DeadlinePassed,
    BadProof(String),
    AuthFailed(String),
    InsufficientDeposit { need: U128, got: U128 },
}

impl std::fmt::Display for IntentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(m) => write!(f, "Unauthorized: {m}"),
            Self::InvalidInput(m) => write!(f, "Invalid input: {m}"),
            Self::NotFound => write!(f, "Offer not found"),
            Self::NotOpen => write!(f, "Offer is not open"),
            Self::DeadlineNotReached => write!(f, "Deadline not reached"),
            Self::DeadlinePassed => write!(f, "Deadline already passed"),
            Self::BadProof(m) => write!(f, "Bad proof: {m}"),
            Self::AuthFailed(m) => write!(f, "Auth failed: {m}"),
            Self::InsufficientDeposit { need, got } => {
                write!(f, "Insufficient deposit: need {}, got {}", need.0, got.0)
            }
        }
    }
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    Offers,
    AcceptedFts,
    FtEscrow,
}

#[derive(Clone, Debug)]
#[near(serializers = [json, borsh])]
pub struct FtConfig {
    pub min_bounty: U128,
    pub max_bounty: U128,
}

#[derive(Clone, Debug)]
#[near(serializers = [json, borsh])]
pub enum OfferKind {
    BoostViews {
        post_path: String,
        target_views: u64,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
#[near(serializers = [json, borsh])]
pub enum OfferStatus {
    Open,
    Claimed,
    Cancelled,
    Expired,
}

#[derive(Clone, Debug)]
#[near(serializers = [json, borsh])]
pub struct Offer {
    pub id: u64,
    pub creator: AccountId,
    pub kind: OfferKind,
    pub bounty: u128,
    /// `None` = NEAR-bountied. `Some(ft)` = NEP-141 token at `ft`.
    pub bounty_token: Option<AccountId>,
    pub deadline_ms: u64,
    pub status: OfferStatus,
    pub winner: Option<AccountId>,
    pub created_at_ms: u64,
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct OfferInput {
    pub kind: OfferKind,
    pub bounty: U128,
    pub deadline_ms: U64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct OnsocialIntents {
    version: String,
    owner_id: AccountId,
    next_offer_id: u64,
    offers: IterableMap<u64, Offer>,
    oracle_pks: Vec<PublicKey>,
    /// Locked NEAR bounty total.
    escrow_locked: u128,
    accepted_fts: IterableMap<AccountId, FtConfig>,
    /// Locked FT bounty total per token.
    ft_escrow_locked: IterableMap<AccountId, u128>,
}

#[near]
impl OnsocialIntents {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        Self {
            version: CONTRACT_VERSION.to_string(),
            owner_id,
            next_offer_id: 1,
            offers: IterableMap::new(StorageKey::Offers),
            oracle_pks: Vec::new(),
            escrow_locked: 0,
            accepted_fts: IterableMap::new(StorageKey::AcceptedFts),
            ft_escrow_locked: IterableMap::new(StorageKey::FtEscrow),
        }
    }

    /// Creates a NEAR-bountied offer.
    #[payable]
    #[handle_result]
    pub fn create_offer(&mut self, input: OfferInput) -> Result<U64, IntentError> {
        let bounty = input.bounty.0;
        if !(MIN_BOUNTY_YOCTO..=MAX_BOUNTY_YOCTO).contains(&bounty) {
            return Err(IntentError::InvalidInput(format!(
                "bounty out of range [{MIN_BOUNTY_YOCTO}, {MAX_BOUNTY_YOCTO}]"
            )));
        }

        let now_ms = ms_now();
        let deadline_ms = input.deadline_ms.0;
        let delta_ms = deadline_ms.saturating_sub(now_ms);
        let min_dl = MIN_DEADLINE_NS / 1_000_000;
        let max_dl = MAX_DEADLINE_NS / 1_000_000;
        if !(min_dl..=max_dl).contains(&delta_ms) {
            return Err(IntentError::InvalidInput("deadline out of range".into()));
        }

        validate_kind(&input.kind)?;

        let need = bounty.saturating_add(STORAGE_PER_OFFER);
        let got = env::attached_deposit().as_yoctonear();
        if got < need {
            return Err(IntentError::InsufficientDeposit {
                need: U128(need),
                got: U128(got),
            });
        }

        let id = self.next_offer_id;
        self.next_offer_id = self
            .next_offer_id
            .checked_add(1)
            .ok_or_else(|| IntentError::InvalidInput("offer id overflow".into()))?;

        let creator = env::predecessor_account_id();
        let offer = Offer {
            id,
            creator: creator.clone(),
            kind: input.kind,
            bounty,
            bounty_token: None,
            deadline_ms,
            status: OfferStatus::Open,
            winner: None,
            created_at_ms: now_ms,
        };

        self.offers.insert(id, offer.clone());
        self.escrow_locked = self.escrow_locked.saturating_add(bounty);

        let refund = got.saturating_sub(need);
        if refund > 0 {
            let _ = Promise::new(creator.clone()).transfer(NearToken::from_yoctonear(refund));
        }

        emit_event(
            "OFFER_CREATED",
            &creator,
            serde_json::json!({
                "id": U64(id),
                "bounty": U128(bounty),
                "bounty_token": serde_json::Value::Null,
                "deadline_ms": U64(deadline_ms),
                "kind": offer.kind,
            }),
        );

        Ok(U64(id))
    }

    /// NEP-141 receiver callback for FT-bountied offers.
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let token_id = env::predecessor_account_id();

        let cfg = match self.accepted_fts.get(&token_id).cloned() {
            Some(c) => c,
            None => {
                emit_event(
                    "FT_REJECTED",
                    &sender_id,
                    serde_json::json!({ "token_id": token_id, "reason": "not_allowlisted" }),
                );
                return PromiseOrValue::Value(amount);
            }
        };

        let input: OfferInput = match serde_json::from_str(&msg) {
            Ok(v) => v,
            Err(_) => {
                emit_event(
                    "FT_REJECTED",
                    &sender_id,
                    serde_json::json!({ "token_id": token_id, "reason": "bad_msg" }),
                );
                return PromiseOrValue::Value(amount);
            }
        };

        if input.bounty.0 != amount.0 {
            emit_event(
                "FT_REJECTED",
                &sender_id,
                serde_json::json!({ "token_id": token_id, "reason": "bounty_amount_mismatch" }),
            );
            return PromiseOrValue::Value(amount);
        }

        if amount.0 < cfg.min_bounty.0 || amount.0 > cfg.max_bounty.0 {
            emit_event(
                "FT_REJECTED",
                &sender_id,
                serde_json::json!({ "token_id": token_id, "reason": "bounty_out_of_range" }),
            );
            return PromiseOrValue::Value(amount);
        }

        let now_ms = ms_now();
        let delta_ms = input.deadline_ms.0.saturating_sub(now_ms);
        let min_dl = MIN_DEADLINE_NS / 1_000_000;
        let max_dl = MAX_DEADLINE_NS / 1_000_000;
        if !(min_dl..=max_dl).contains(&delta_ms) {
            emit_event(
                "FT_REJECTED",
                &sender_id,
                serde_json::json!({ "token_id": token_id, "reason": "bad_deadline" }),
            );
            return PromiseOrValue::Value(amount);
        }

        if validate_kind(&input.kind).is_err() {
            emit_event(
                "FT_REJECTED",
                &sender_id,
                serde_json::json!({ "token_id": token_id, "reason": "bad_kind" }),
            );
            return PromiseOrValue::Value(amount);
        }

        let id = match self.next_offer_id.checked_add(1) {
            Some(_) => {
                let i = self.next_offer_id;
                self.next_offer_id = i + 1;
                i
            }
            None => return PromiseOrValue::Value(amount),
        };

        let offer = Offer {
            id,
            creator: sender_id.clone(),
            kind: input.kind.clone(),
            bounty: amount.0,
            bounty_token: Some(token_id.clone()),
            deadline_ms: input.deadline_ms.0,
            status: OfferStatus::Open,
            winner: None,
            created_at_ms: now_ms,
        };
        self.offers.insert(id, offer);
        let prev = self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0);
        self.ft_escrow_locked
            .insert(token_id.clone(), prev.saturating_add(amount.0));

        emit_event(
            "OFFER_CREATED",
            &sender_id,
            serde_json::json!({
                "id": U64(id),
                "bounty": amount,
                "bounty_token": token_id,
                "deadline_ms": input.deadline_ms,
                "kind": input.kind,
            }),
        );

        PromiseOrValue::Value(U128(0))
    }

    /// Claims an open offer after oracle verification.
    #[handle_result]
    pub fn claim_offer(
        &mut self,
        offer_id: U64,
        winner: AccountId,
        evidence_hash: String,
        attestation: OracleAuth,
    ) -> Result<Promise, IntentError> {
        let offer = self
            .offers
            .get(&offer_id.0)
            .cloned()
            .ok_or(IntentError::NotFound)?;
        if offer.status != OfferStatus::Open {
            return Err(IntentError::NotOpen);
        }
        if ms_now() > offer.deadline_ms {
            return Err(IntentError::DeadlinePassed);
        }

        let action_json = serde_json::json!({
            "method": "claim_offer",
            "offer_id": offer_id,
            "winner": winner,
            "evidence_hash": evidence_hash,
        });
        let oracle_ctx = authenticate_oracle(
            &attestation,
            &action_json,
            NONCE_PREFIX,
            &self.oracle_pks,
            DOMAIN_PREFIX,
        )
        .map_err(|e| IntentError::AuthFailed(format!("{e:?}")))?;

        let (ref owner, ref public_key, nonce) = oracle_ctx.signed_nonce;
        record_nonce(NONCE_PREFIX, owner, public_key, nonce);

        // Mark claimed before transfer; callbacks roll back on failure.
        let bounty = offer.bounty;
        let bounty_token = offer.bounty_token.clone();
        let mut updated = offer.clone();
        updated.status = OfferStatus::Claimed;
        updated.winner = Some(winner.clone());
        self.offers.insert(offer.id, updated);

        match bounty_token {
            None => {
                self.escrow_locked = self.escrow_locked.saturating_sub(bounty);
                Ok(Promise::new(winner.clone())
                    .transfer(NearToken::from_yoctonear(bounty))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_claim_callback(U64(offer.id), winner, U128(bounty)),
                    ))
            }
            Some(token_id) => {
                let prev = self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0);
                self.ft_escrow_locked
                    .insert(token_id.clone(), prev.saturating_sub(bounty));
                Ok(ext_ft::ext(token_id.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(winner.clone(), U128(bounty), None)
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_ft_claim_callback(U64(offer.id), token_id, winner, U128(bounty)),
                    ))
            }
        }
    }

    /// Cancels an open offer; post-deadline cleanup is permissionless.
    #[handle_result]
    pub fn cancel_offer(&mut self, offer_id: U64) -> Result<Promise, IntentError> {
        let offer = self
            .offers
            .get(&offer_id.0)
            .cloned()
            .ok_or(IntentError::NotFound)?;
        if offer.status != OfferStatus::Open {
            return Err(IntentError::NotOpen);
        }

        let now = ms_now();
        let deadline_passed = now > offer.deadline_ms;
        let caller = env::predecessor_account_id();

        if !deadline_passed && caller != offer.creator {
            return Err(IntentError::Unauthorized(
                "only creator may cancel before deadline".into(),
            ));
        }

        let bounty = offer.bounty;
        let bounty_token = offer.bounty_token.clone();
        let mut updated = offer.clone();
        updated.status = if deadline_passed {
            OfferStatus::Expired
        } else {
            OfferStatus::Cancelled
        };
        self.offers.insert(offer.id, updated);

        match bounty_token {
            None => {
                self.escrow_locked = self.escrow_locked.saturating_sub(bounty);
                let refund = bounty.saturating_add(STORAGE_PER_OFFER);
                Ok(Promise::new(offer.creator.clone())
                    .transfer(NearToken::from_yoctonear(refund))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_refund_callback(U64(offer.id), offer.creator, U128(refund)),
                    ))
            }
            Some(token_id) => {
                let prev = self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0);
                self.ft_escrow_locked
                    .insert(token_id.clone(), prev.saturating_sub(bounty));
                Ok(ext_ft::ext(token_id.clone())
                    .with_attached_deposit(NearToken::from_yoctonear(1))
                    .with_static_gas(GAS_FT_TRANSFER)
                    .ft_transfer(offer.creator.clone(), U128(bounty), None)
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_CALLBACK)
                            .on_ft_refund_callback(
                                U64(offer.id),
                                token_id,
                                offer.creator,
                                U128(bounty),
                            ),
                    ))
            }
        }
    }

    #[private]
    pub fn on_claim_callback(
        &mut self,
        #[callback_result] result: Result<(), PromiseError>,
        offer_id: U64,
        winner: AccountId,
        amount: U128,
    ) {
        if result.is_ok() {
            emit_event(
                "OFFER_CLAIMED",
                &winner,
                serde_json::json!({
                    "id": offer_id,
                    "winner": winner,
                    "amount": amount,
                }),
            );
        } else {
            // Roll back to Open if the transfer failed.
            if let Some(offer) = self.offers.get(&offer_id.0).cloned() {
                let mut o = offer;
                o.status = OfferStatus::Open;
                o.winner = None;
                self.offers.insert(offer_id.0, o);
                self.escrow_locked = self.escrow_locked.saturating_add(amount.0);
            }
            emit_event(
                "OFFER_CLAIM_FAILED",
                &winner,
                serde_json::json!({ "id": offer_id, "amount": amount }),
            );
        }
    }

    #[private]
    pub fn on_refund_callback(
        &mut self,
        #[callback_result] result: Result<(), PromiseError>,
        offer_id: U64,
        creator: AccountId,
        amount: U128,
    ) {
        if result.is_ok() {
            emit_event(
                "OFFER_REFUNDED",
                &creator,
                serde_json::json!({ "id": offer_id, "amount": amount }),
            );
        } else {
            // Roll back to Open if the refund failed.
            if let Some(offer) = self.offers.get(&offer_id.0).cloned() {
                let mut o = offer;
                o.status = OfferStatus::Open;
                self.offers.insert(offer_id.0, o);
                self.escrow_locked = self
                    .escrow_locked
                    .saturating_add(amount.0.saturating_sub(STORAGE_PER_OFFER));
            }
            emit_event(
                "OFFER_REFUND_FAILED",
                &creator,
                serde_json::json!({ "id": offer_id, "amount": amount }),
            );
        }
    }

    #[private]
    pub fn on_ft_claim_callback(
        &mut self,
        #[callback_result] result: Result<(), PromiseError>,
        offer_id: U64,
        token_id: AccountId,
        winner: AccountId,
        amount: U128,
    ) {
        if result.is_ok() {
            emit_event(
                "OFFER_CLAIMED",
                &winner,
                serde_json::json!({
                    "id": offer_id,
                    "winner": winner,
                    "amount": amount,
                    "bounty_token": token_id,
                }),
            );
        } else {
            // Roll back to Open if the transfer failed.
            if let Some(offer) = self.offers.get(&offer_id.0).cloned() {
                let mut o = offer;
                o.status = OfferStatus::Open;
                o.winner = None;
                self.offers.insert(offer_id.0, o);
                let prev = self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0);
                self.ft_escrow_locked
                    .insert(token_id.clone(), prev.saturating_add(amount.0));
            }
            emit_event(
                "OFFER_CLAIM_FAILED",
                &winner,
                serde_json::json!({
                    "id": offer_id,
                    "amount": amount,
                    "bounty_token": token_id,
                }),
            );
        }
    }

    #[private]
    pub fn on_ft_refund_callback(
        &mut self,
        #[callback_result] result: Result<(), PromiseError>,
        offer_id: U64,
        token_id: AccountId,
        creator: AccountId,
        amount: U128,
    ) {
        if result.is_ok() {
            emit_event(
                "OFFER_REFUNDED",
                &creator,
                serde_json::json!({
                    "id": offer_id,
                    "amount": amount,
                    "bounty_token": token_id,
                }),
            );
        } else {
            // Roll back to Open if the refund failed.
            if let Some(offer) = self.offers.get(&offer_id.0).cloned() {
                let mut o = offer;
                o.status = OfferStatus::Open;
                self.offers.insert(offer_id.0, o);
                let prev = self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0);
                self.ft_escrow_locked
                    .insert(token_id.clone(), prev.saturating_add(amount.0));
            }
            emit_event(
                "OFFER_REFUND_FAILED",
                &creator,
                serde_json::json!({
                    "id": offer_id,
                    "amount": amount,
                    "bounty_token": token_id,
                }),
            );
        }
    }

    #[payable]
    #[handle_result]
    pub fn add_oracle_pk(&mut self, key: PublicKey) -> Result<(), IntentError> {
        self.assert_owner_with_one_yocto()?;
        if self.oracle_pks.iter().any(|pk| pk == &key) {
            return Err(IntentError::InvalidInput("oracle pk already exists".into()));
        }
        if self.oracle_pks.len() >= MAX_ORACLE_PKS {
            return Err(IntentError::InvalidInput(format!(
                "too many oracle pks (max {MAX_ORACLE_PKS})"
            )));
        }
        self.oracle_pks.push(key.clone());
        emit_event(
            "ORACLE_PK_ADDED",
            &self.owner_id.clone(),
            serde_json::json!({ "key": key }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn remove_oracle_pk(&mut self, key: PublicKey) -> Result<(), IntentError> {
        self.assert_owner_with_one_yocto()?;
        let pos = self
            .oracle_pks
            .iter()
            .position(|pk| pk == &key)
            .ok_or(IntentError::NotFound)?;
        self.oracle_pks.remove(pos);
        emit_event(
            "ORACLE_PK_REMOVED",
            &self.owner_id.clone(),
            serde_json::json!({ "key": key }),
        );
        Ok(())
    }

    /// Allowlists an FT contract for `ft_transfer_call` offer funding.
    #[payable]
    #[handle_result]
    pub fn add_accepted_ft(
        &mut self,
        token_id: AccountId,
        min_bounty: U128,
        max_bounty: U128,
    ) -> Result<(), IntentError> {
        self.assert_owner_with_one_yocto()?;
        if min_bounty.0 == 0 || max_bounty.0 < min_bounty.0 {
            return Err(IntentError::InvalidInput(
                "min_bounty>0 and max_bounty>=min_bounty required".into(),
            ));
        }
        if self.accepted_fts.contains_key(&token_id) {
            return Err(IntentError::InvalidInput("ft already allowlisted".into()));
        }
        if self.accepted_fts.len() as usize >= MAX_ACCEPTED_FTS {
            return Err(IntentError::InvalidInput(format!(
                "too many accepted fts (max {MAX_ACCEPTED_FTS})"
            )));
        }
        self.accepted_fts.insert(
            token_id.clone(),
            FtConfig {
                min_bounty,
                max_bounty,
            },
        );
        emit_event(
            "FT_ALLOWLISTED",
            &self.owner_id.clone(),
            serde_json::json!({
                "token_id": token_id,
                "min_bounty": min_bounty,
                "max_bounty": max_bounty,
            }),
        );
        Ok(())
    }

    /// Delists an FT for new deposits.
    #[payable]
    #[handle_result]
    pub fn remove_accepted_ft(&mut self, token_id: AccountId) -> Result<(), IntentError> {
        self.assert_owner_with_one_yocto()?;
        self.accepted_fts
            .remove(&token_id)
            .ok_or(IntentError::NotFound)?;
        emit_event(
            "FT_DELISTED",
            &self.owner_id.clone(),
            serde_json::json!({ "token_id": token_id }),
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn set_owner(&mut self, new_owner: AccountId) -> Result<(), IntentError> {
        self.assert_owner_with_one_yocto()?;
        let old = self.owner_id.clone();
        self.owner_id = new_owner.clone();
        emit_event(
            "OWNER_CHANGED",
            &old,
            serde_json::json!({ "old_owner": old, "new_owner": new_owner }),
        );
        Ok(())
    }

    #[handle_result]
    pub fn update_contract(&self) -> Result<Promise, IntentError> {
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

    #[private]
    #[init(ignore_state)]
    pub fn migrate() -> Self {
        let mut state: Self = env::state_read().expect("State read failed");
        let old = state.version.clone();
        state.version = CONTRACT_VERSION.to_string();
        emit_event(
            "CONTRACT_UPGRADE",
            &state.owner_id.clone(),
            serde_json::json!({ "old_version": old, "new_version": CONTRACT_VERSION }),
        );
        state
    }

    pub fn get_offer(&self, offer_id: U64) -> Option<Offer> {
        self.offers.get(&offer_id.0).cloned()
    }

    pub fn list_open_offers(&self, from_index: U64, limit: u32) -> Vec<Offer> {
        let from = from_index.0 as usize;
        let lim = limit.clamp(1, 100) as usize;
        self.offers
            .values()
            .filter(|o| o.status == OfferStatus::Open)
            .skip(from)
            .take(lim)
            .cloned()
            .collect()
    }

    pub fn get_stats(&self) -> Stats {
        Stats {
            next_offer_id: U64(self.next_offer_id),
            total_offers: U64(self.offers.len() as u64),
            escrow_locked: U128(self.escrow_locked),
            oracle_count: U64(self.oracle_pks.len() as u64),
            owner_id: self.owner_id.clone(),
            version: self.version.clone(),
        }
    }

    pub fn list_oracle_pks(&self) -> Vec<PublicKey> {
        self.oracle_pks.clone()
    }

    pub fn list_accepted_fts(&self) -> Vec<(AccountId, FtConfig)> {
        self.accepted_fts
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    pub fn get_ft_escrow_locked(&self, token_id: AccountId) -> U128 {
        U128(self.ft_escrow_locked.get(&token_id).copied().unwrap_or(0))
    }

    fn assert_owner(&self) -> Result<(), IntentError> {
        if env::predecessor_account_id() != self.owner_id {
            return Err(IntentError::Unauthorized("owner only".into()));
        }
        Ok(())
    }

    fn assert_owner_with_one_yocto(&self) -> Result<(), IntentError> {
        if env::attached_deposit().as_yoctonear() != 1 {
            return Err(IntentError::InvalidInput("attach 1 yoctoNEAR".into()));
        }
        self.assert_owner()
    }
}

#[derive(Clone, Debug)]
#[near(serializers = [json])]
pub struct Stats {
    pub next_offer_id: U64,
    pub total_offers: U64,
    pub escrow_locked: U128,
    pub oracle_count: U64,
    pub owner_id: AccountId,
    pub version: String,
}

fn ms_now() -> u64 {
    env::block_timestamp() / 1_000_000
}

fn validate_kind(kind: &OfferKind) -> Result<(), IntentError> {
    match kind {
        OfferKind::BoostViews {
            post_path,
            target_views,
        } => {
            if post_path.is_empty() || post_path.len() > 256 {
                return Err(IntentError::InvalidInput("post_path 1..=256 bytes".into()));
            }
            if *target_views == 0 || *target_views > 10_000_000 {
                return Err(IntentError::InvalidInput(
                    "target_views must be 1..=10_000_000".into(),
                ));
            }
            Ok(())
        }
    }
}

fn emit_event(event: &str, account_id: &AccountId, data: serde_json::Value) {
    // Keep account_id flat to match existing event tables.
    let mut obj = match data {
        serde_json::Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };
    obj.insert(
        "account_id".to_string(),
        serde_json::Value::String(account_id.to_string()),
    );
    let payload = serde_json::json!({
        "standard": EVENT_STANDARD,
        "version": EVENT_VERSION,
        "event": event,
        "data": [serde_json::Value::Object(obj)],
    });
    env::log_str(&format!("EVENT_JSON:{payload}"));
}

#[cfg(test)]
mod tests;
