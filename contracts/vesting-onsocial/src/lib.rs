use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::serde_json::{self, Value};
use near_sdk_macros::NearSchema;
use near_sdk::{
    AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise, PromiseError,
    env, near, require,
};

const EVENT_STANDARD: &str = "onsocial";
const EVENT_VERSION: &str = "1.0.0";
const GAS_FT_TRANSFER: Gas = Gas::from_tgas(10);
const GAS_STORAGE_DEPOSIT: Gas = Gas::from_tgas(10);
const GAS_CALLBACK: Gas = Gas::from_tgas(15);
const ONE_YOCTO: NearToken = NearToken::from_yoctonear(1);
const FT_STORAGE_DEPOSIT: NearToken = NearToken::from_millinear(2);

#[derive(NearSchema, near_sdk::FunctionError)]
#[abi(json)]
#[derive(Debug, Clone, serde::Serialize)]
pub enum VestingError {
    Unauthorized(String),
    NotFunded,
    ClaimPending,
    NothingToClaim,
}

impl std::fmt::Display for VestingError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unauthorized(msg) => write!(f, "Unauthorized: {}", msg),
            Self::NotFunded => write!(f, "Contract not funded"),
            Self::ClaimPending => write!(f, "Claim already pending"),
            Self::NothingToClaim => write!(f, "Nothing to claim"),
        }
    }
}

#[derive(BorshStorageKey)]
#[near]
enum StorageKey {
    PendingClaims,
}

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct PendingClaim {
    pub amount: u128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct VestingConfigView {
    pub owner_id: AccountId,
    pub token_id: AccountId,
    pub beneficiary_id: AccountId,
    pub total_amount: U128,
    pub claimed_amount: U128,
    pub start_at_ns: u64,
    pub cliff_at_ns: u64,
    pub end_at_ns: u64,
    pub funded: bool,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct VestingStatusView {
    pub total_amount: U128,
    pub claimed_amount: U128,
    pub vested_amount: U128,
    pub claimable_amount: U128,
    pub unvested_amount: U128,
    pub funded: bool,
    pub now_ns: u64,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct VestingContract {
    owner_id: AccountId,
    token_id: AccountId,
    beneficiary_id: AccountId,
    total_amount: u128,
    claimed_amount: u128,
    pending_claims: LookupMap<AccountId, PendingClaim>,
    start_at_ns: u64,
    cliff_at_ns: u64,
    end_at_ns: u64,
    funded: bool,
}

#[near]
impl VestingContract {
    #[init]
    pub fn new(
        owner_id: AccountId,
        token_id: AccountId,
        beneficiary_id: AccountId,
        total_amount: U128,
        start_at_ns: u64,
        cliff_at_ns: u64,
        end_at_ns: u64,
    ) -> Self {
        require!(total_amount.0 > 0, "Invalid vesting schedule");
        require!(cliff_at_ns >= start_at_ns, "Cliff must be >= start");
        require!(end_at_ns > cliff_at_ns, "End must be > cliff");

        let contract = Self {
            owner_id,
            token_id,
            beneficiary_id,
            total_amount: total_amount.0,
            claimed_amount: 0,
            pending_claims: LookupMap::new(StorageKey::PendingClaims),
            start_at_ns,
            cliff_at_ns,
            end_at_ns,
            funded: false,
        };

        contract.emit_event(
            "VESTING_CREATED",
            &contract.beneficiary_id,
            serde_json::json!({
                "beneficiary_id": contract.beneficiary_id.to_string(),
                "total_amount": contract.total_amount.to_string(),
                "start_at_ns": contract.start_at_ns,
                "cliff_at_ns": contract.cliff_at_ns,
                "end_at_ns": contract.end_at_ns,
            }),
        );

        contract
    }

    pub fn get_config(&self) -> VestingConfigView {
        VestingConfigView {
            owner_id: self.owner_id.clone(),
            token_id: self.token_id.clone(),
            beneficiary_id: self.beneficiary_id.clone(),
            total_amount: U128(self.total_amount),
            claimed_amount: U128(self.claimed_amount),
            start_at_ns: self.start_at_ns,
            cliff_at_ns: self.cliff_at_ns,
            end_at_ns: self.end_at_ns,
            funded: self.funded,
        }
    }

    pub fn get_status(&self) -> VestingStatusView {
        let now_ns = env::block_timestamp();
        let vested_amount = self.compute_vested(now_ns);
        let claimable_amount = vested_amount.saturating_sub(self.claimed_amount);

        VestingStatusView {
            total_amount: U128(self.total_amount),
            claimed_amount: U128(self.claimed_amount),
            vested_amount: U128(vested_amount),
            claimable_amount: U128(claimable_amount),
            unvested_amount: U128(self.total_amount.saturating_sub(vested_amount)),
            funded: self.funded,
            now_ns,
        }
    }

    pub fn get_vested_amount(&self) -> U128 {
        U128(self.compute_vested(env::block_timestamp()))
    }

    pub fn get_claimable_amount(&self) -> U128 {
        let vested_amount = self.compute_vested(env::block_timestamp());
        U128(vested_amount.saturating_sub(self.claimed_amount))
    }

    pub fn get_unvested_amount(&self) -> U128 {
        let vested_amount = self.compute_vested(env::block_timestamp());
        U128(self.total_amount.saturating_sub(vested_amount))
    }

    #[handle_result]
    pub fn set_beneficiary(&mut self, new_beneficiary: AccountId) -> Result<(), VestingError> {
        self.assert_owner()?;
        let old_beneficiary = self.beneficiary_id.clone();
        self.beneficiary_id = new_beneficiary.clone();
        self.emit_event(
            "BENEFICIARY_CHANGED",
            &old_beneficiary,
            serde_json::json!({
                "old_beneficiary": old_beneficiary.to_string(),
                "new_beneficiary": new_beneficiary.to_string(),
            }),
        );
        Ok(())
    }

    #[handle_result]
    pub fn claim(&mut self) -> Result<Promise, VestingError> {
        let account_id = env::predecessor_account_id();
        self.assert_beneficiary()?;
        if !self.funded {
            return Err(VestingError::NotFunded);
        }
        if self.pending_claims.contains_key(&account_id) {
            return Err(VestingError::ClaimPending);
        }

        let claimable = self.compute_vested(env::block_timestamp())
            .saturating_sub(self.claimed_amount);
        if claimable == 0 {
            return Err(VestingError::NothingToClaim);
        }

        self.claimed_amount = self.claimed_amount.saturating_add(claimable);
        self.pending_claims.insert(
            account_id.clone(),
            PendingClaim { amount: claimable },
        );

        Ok(self.ft_transfer_with_callback(
            account_id.clone(),
            claimable,
            "on_claim_callback",
            serde_json::json!({
                "account_id": account_id,
                "amount": U128(claimable)
            }),
        ))
    }

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> U128 {
        let _ = msg;
        require!(
            env::predecessor_account_id() == self.token_id,
            "Wrong token"
        );
        require!(sender_id == self.owner_id, "Only owner can fund");
        require!(!self.funded, "Already funded");
        require!(
            amount.0 == self.total_amount,
            "Funding amount mismatch"
        );

        self.funded = true;
        self.emit_event(
            "VESTING_FUNDED",
            &sender_id,
            serde_json::json!({
                "amount": amount.0.to_string(),
                "total_amount": self.total_amount.to_string(),
            }),
        );
        U128(0)
    }

    #[private]
    pub fn on_claim_callback(
        &mut self,
        #[callback_result] call_result: Result<(), PromiseError>,
        account_id: AccountId,
        amount: U128,
    ) {
        let pending = self
            .pending_claims
            .remove(&account_id)
            .unwrap_or_else(|| env::panic_str("No pending claim"));

        if call_result.is_ok() {
            self.emit_event(
                "VESTING_CLAIMED",
                &account_id,
                serde_json::json!({
                    "amount": amount.0.to_string(),
                    "claimed_amount": self.claimed_amount.to_string(),
                    "claimable_amount": "0",
                }),
            );
        } else {
            self.claimed_amount = self.claimed_amount.saturating_sub(pending.amount);
            self.emit_event(
                "CLAIM_FAILED",
                &account_id,
                serde_json::json!({
                    "amount": pending.amount.to_string(),
                    "claimed_amount": self.claimed_amount.to_string(),
                }),
            );
        }
    }
}

impl VestingContract {
    fn assert_owner(&self) -> Result<(), VestingError> {
        if env::predecessor_account_id() != self.owner_id {
            return Err(VestingError::Unauthorized("Only owner".into()));
        }
        Ok(())
    }

    fn assert_beneficiary(&self) -> Result<(), VestingError> {
        if env::predecessor_account_id() != self.beneficiary_id {
            return Err(VestingError::Unauthorized("Only beneficiary".into()));
        }
        Ok(())
    }

    fn compute_vested(&self, now_ns: u64) -> u128 {
        if now_ns < self.cliff_at_ns {
            return 0;
        }
        if now_ns >= self.end_at_ns {
            return self.total_amount;
        }

        let elapsed = (now_ns - self.cliff_at_ns) as u128;
        let duration = (self.end_at_ns - self.cliff_at_ns) as u128;
        self.total_amount.saturating_mul(elapsed) / duration
    }

    fn emit_event(&self, event: &str, account_id: &AccountId, mut data: Value) {
        if let Value::Object(ref mut map) = data {
            map.insert("account_id".into(), serde_json::json!(account_id.to_string()));
        }
        let log = serde_json::json!({
            "standard": EVENT_STANDARD,
            "version": EVENT_VERSION,
            "event": event,
            "data": [data]
        });
        env::log_str(&format!("EVENT_JSON:{}", log));
    }

    fn ft_transfer_with_callback(
        &self,
        receiver: AccountId,
        amount: u128,
        callback: &str,
        args: Value,
    ) -> Promise {
        Promise::new(self.token_id.clone())
            .function_call(
                "storage_deposit".to_string(),
                serde_json::json!({
                    "account_id": receiver.clone(),
                    "registration_only": true
                })
                .to_string()
                .into_bytes(),
                FT_STORAGE_DEPOSIT,
                GAS_STORAGE_DEPOSIT,
            )
            .function_call(
                "ft_transfer".to_string(),
                serde_json::json!({
                    "receiver_id": receiver,
                    "amount": U128(amount)
                })
                .to_string()
                .into_bytes(),
                ONE_YOCTO,
                GAS_FT_TRANSFER,
            )
            .then(Promise::new(env::current_account_id()).function_call(
                callback.to_string(),
                args.to_string().into_bytes(),
                NearToken::from_yoctonear(0),
                GAS_CALLBACK,
            ))
    }
}

#[cfg(test)]
mod tests;