use crate::constants::{GAS_NEAR_WITHDRAW_TGAS, GAS_UNWRAP_CALLBACK_TGAS, WNEAR_STORAGE_KEY};
use crate::events::{EventBatch, EventBuilder};
use crate::{Contract, ContractExt};
use near_sdk::ext_contract;
use near_sdk::json_types::U128;
use near_sdk::{AccountId, Gas, NearToken, PromiseOrValue, env, near};

#[ext_contract(ext_wrap)]
#[allow(dead_code)]
trait ExtWrap {
    fn near_withdraw(&mut self, amount: U128);
}

pub(crate) fn read_wnear_account() -> Option<AccountId> {
    env::storage_read(WNEAR_STORAGE_KEY)
        .and_then(|bytes| String::from_utf8(bytes).ok())
        .and_then(|s| s.parse().ok())
}

pub(crate) fn write_wnear_account(account_id: Option<&AccountId>) {
    match account_id {
        Some(id) => env::storage_write(WNEAR_STORAGE_KEY, id.as_str().as_bytes()),
        None => env::storage_remove(WNEAR_STORAGE_KEY),
    };
}

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn set_wnear_account(
        &mut self,
        wnear_account_id: Option<AccountId>,
    ) -> Result<(), crate::SocialError> {
        crate::api::guards::ContractGuards::require_manager_one_yocto(&self.platform)?;
        write_wnear_account(wnear_account_id.as_ref());

        let caller = crate::state::models::SocialPlatform::current_caller();
        let wnear_value: near_sdk::serde_json::Value = match &wnear_account_id {
            Some(id) => near_sdk::serde_json::Value::String(id.to_string()),
            None => near_sdk::serde_json::Value::Null,
        };
        let mut batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_CONTRACT_UPDATE,
            "wnear_account_set",
            caller,
        )
        .with_field("wnear_account_id", wnear_value)
        .emit(&mut batch);
        let _ = batch.emit();
        Ok(())
    }

    pub fn get_wnear_account(&self) -> Option<AccountId> {
        read_wnear_account()
    }

    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> PromiseOrValue<U128> {
        let wnear_id =
            read_wnear_account().unwrap_or_else(|| env::panic_str("wNEAR account not configured"));

        near_sdk::require!(
            env::predecessor_account_id() == wnear_id,
            "Only wNEAR accepted"
        );
        near_sdk::require!(amount.0 > 0, "Amount must be positive");

        let target = if msg.is_empty() {
            format!("user:{}", sender_id)
        } else if msg == "platform_pool" {
            format!("platform_pool:{}", sender_id)
        } else {
            let _: AccountId = msg
                .parse()
                .unwrap_or_else(|_| env::panic_str("Invalid account_id in msg"));
            format!("user:{}", msg)
        };

        ext_wrap::ext(wnear_id)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(Gas::from_tgas(GAS_NEAR_WITHDRAW_TGAS))
            .near_withdraw(amount)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(GAS_UNWRAP_CALLBACK_TGAS))
                    .on_wnear_unwrapped(target, amount),
            )
            .into()
    }

    #[private]
    pub fn on_wnear_unwrapped(&mut self, target: String, amount: U128) -> U128 {
        let (kind, id) = target.split_once(':').unwrap_or(("user", target.as_str()));
        let account_id: AccountId = id.parse().unwrap_or_else(|_| env::panic_str("Bad target"));

        if env::promise_results_count() == 1 && env::promise_result_checked(0, 64).is_ok() {
            let mut batch = EventBatch::new();

            match kind {
                "platform_pool" => {
                    let _ = self.platform.platform_pool_deposit_internal(
                        amount.0,
                        &account_id,
                        &mut batch,
                    );
                }
                _ => {
                    self.platform.credit_storage_balance(&account_id, amount.0);
                    let new_balance = self
                        .platform
                        .user_storage
                        .get(&account_id)
                        .map(|s| s.balance.0)
                        .unwrap_or(0);
                    EventBuilder::new(
                        crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                        "wnear_deposit",
                        account_id.clone(),
                    )
                    .with_field("amount", amount.0.to_string())
                    .with_field("new_balance", new_balance.to_string())
                    .emit(&mut batch);
                }
            }

            let _ = batch.emit();
            return U128(0);
        }

        let mut batch = EventBatch::new();
        EventBuilder::new(
            crate::constants::EVENT_TYPE_STORAGE_UPDATE,
            "wnear_unwrap_failed",
            account_id.clone(),
        )
        .with_field("amount", amount.0.to_string())
        .with_field("target", kind)
        .emit(&mut batch);
        let _ = batch.emit();

        amount
    }
}
