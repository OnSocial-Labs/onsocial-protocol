//! Sponsored SOCIAL `ft_transfer_call` into the boost contract.
//!
//! The delegate allow-list is still a contract id plus a method name. This
//! module is the extra shape check for the token: one action, method
//! `ft_transfer_call`, deposit of exactly 1 yoctoNEAR, and a parsed
//! `receiver_id` that is the boost contract. An hourly per-account count and
//! a relayer-wide daily spend cap sit beside that check. There is no older
//! quota store in this crate.

use near_primitives::transaction::Action;
use near_primitives::types::AccountId;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::Mutex;

pub const FT_TRANSFER_CALL_METHOD: &str = "ft_transfer_call";
pub const FT_TRANSFER_METHOD: &str = "ft_transfer";
pub const ONE_YOCTO: u128 = 1;
/// A commit, a few increases, and a retry fit in one sitting. A seventh
/// sponsored boost in the same hour falls back to the wallet.
pub const DEFAULT_HOURLY_LIMIT: u32 = 6;
/// 1 NEAR of prepaid gas for the whole relayer per UTC day.
pub const DEFAULT_FLEET_DAILY_SPEND_YOCTO: u128 = 1_000_000_000_000_000_000_000_000;
/// Common minimum gas price, yoctoNEAR per gas unit.
pub const DEFAULT_GAS_PRICE_YOCTO: u128 = 100_000_000;
pub const BOOST_SPONSOR_LIMIT: &str = "BOOST_SPONSOR_LIMIT";

const HOUR_SECS: i64 = 3_600;
const DAY_SECS: i64 = 86_400;

pub struct SponsorPolicy {
    pub token_contract_id: AccountId,
    pub boost_contract_id: AccountId,
    pub allowed_methods: Vec<String>,
}

/// Prepaid gas on an accepted sponsored boost transfer.
#[derive(Debug)]
pub struct SponsoredBoostCall {
    pub gas: u64,
}

/// Reject anything that is not one sponsored boost transfer, or apply the
/// existing execute / execute_admin rules when the receiver is not the token.
pub fn validate_delegate_actions(
    receiver: &AccountId,
    actions: &[Action],
    policy: &SponsorPolicy,
) -> Result<Option<SponsoredBoostCall>, String> {
    if actions.is_empty() {
        return Err("Delegate must contain at least one action".to_string());
    }

    if receiver == &policy.token_contract_id {
        return validate_token_boost_transfer(actions, policy).map(Some);
    }

    if actions.iter().any(action_is_token_transfer) {
        return Err("Token methods are only sponsored on the SOCIAL token contract".to_string());
    }

    for action in actions {
        validate_ordinary_delegate_action(action, &policy.allowed_methods)?;
    }
    Ok(None)
}

fn validate_token_boost_transfer(
    actions: &[Action],
    policy: &SponsorPolicy,
) -> Result<SponsoredBoostCall, String> {
    if actions.len() != 1 {
        return Err("Sponsored token calls must be a single action".to_string());
    }

    let Action::FunctionCall(fc) = &actions[0] else {
        return Err("Only FunctionCall inner actions are allowed".to_string());
    };

    if fc.method_name != FT_TRANSFER_CALL_METHOD {
        return Err(format!("Inner method not allowed: {}", fc.method_name));
    }

    if fc.deposit.as_yoctonear() != ONE_YOCTO {
        return Err("ft_transfer_call deposit must be exactly 1 yoctoNEAR".to_string());
    }

    if fc.gas.as_gas() == 0 {
        return Err("ft_transfer_call gas must be positive".to_string());
    }

    let boost_receiver = parse_boost_receiver(&fc.args)?;
    if boost_receiver != policy.boost_contract_id {
        return Err(format!(
            "ft_transfer_call receiver_id must be {}",
            policy.boost_contract_id
        ));
    }

    Ok(SponsoredBoostCall {
        gas: fc.gas.as_gas(),
    })
}

/// Parse `receiver_id` out of JSON. The raw argument bytes are never scanned
/// for the boost account id.
fn parse_boost_receiver(args: &[u8]) -> Result<AccountId, String> {
    let value: Value = serde_json::from_slice(args)
        .map_err(|_| "ft_transfer_call args must be a JSON object".to_string())?;
    let object = value
        .as_object()
        .ok_or_else(|| "ft_transfer_call args must be a JSON object".to_string())?;
    let receiver = object
        .get("receiver_id")
        .and_then(Value::as_str)
        .ok_or_else(|| "ft_transfer_call receiver_id must be a string".to_string())?;
    receiver
        .parse::<AccountId>()
        .map_err(|_| format!("ft_transfer_call receiver_id is not an account id: {receiver}"))
}

fn action_is_token_transfer(action: &Action) -> bool {
    match action {
        Action::FunctionCall(fc) => {
            fc.method_name == FT_TRANSFER_CALL_METHOD || fc.method_name == FT_TRANSFER_METHOD
        }
        _ => false,
    }
}

pub fn validate_ordinary_delegate_action(
    action: &Action,
    allowed_methods: &[String],
) -> Result<(), String> {
    let fc = match action {
        Action::FunctionCall(fc) => fc.as_ref(),
        _ => return Err("Only FunctionCall inner actions are allowed".to_string()),
    };

    if fc.method_name == FT_TRANSFER_CALL_METHOD || fc.method_name == FT_TRANSFER_METHOD {
        return Err(format!("Inner method not allowed: {}", fc.method_name));
    }

    if !allowed_methods
        .iter()
        .any(|method| method == &fc.method_name)
    {
        return Err(format!("Inner method not allowed: {}", fc.method_name));
    }

    if fc.deposit.as_yoctonear() > ONE_YOCTO {
        return Err(format!(
            "Inner action deposit exceeds max {ONE_YOCTO} yoctoNEAR"
        ));
    }

    Ok(())
}

struct SponsorCounters {
    hourly: HashMap<(String, i64), u32>,
    fleet_daily: HashMap<i64, u128>,
}

/// In-process abuse guard for sponsored boost transfers.
///
/// Each account may take `hourly_limit` sponsored boosts per clock hour.
/// The relayer as a whole may prepay `fleet_daily_cap_yocto` per UTC day.
/// Equal to either limit is allowed. Going over leaves both counters unchanged.
pub struct SponsorQuota {
    hourly_limit: u32,
    fleet_daily_cap_yocto: u128,
    gas_price_yocto: u128,
    counters: Mutex<SponsorCounters>,
}

impl SponsorQuota {
    pub fn new(hourly_limit: u32, fleet_daily_cap_yocto: u128, gas_price_yocto: u128) -> Self {
        Self {
            hourly_limit,
            fleet_daily_cap_yocto,
            gas_price_yocto,
            counters: Mutex::new(SponsorCounters {
                hourly: HashMap::new(),
                fleet_daily: HashMap::new(),
            }),
        }
    }

    pub fn cost_yocto(&self, gas: u64) -> u128 {
        (gas as u128).saturating_mul(self.gas_price_yocto)
    }

    pub fn try_consume_at(
        &self,
        account: &AccountId,
        gas: u64,
        unix_secs: i64,
    ) -> Result<u128, String> {
        let cost = self.cost_yocto(gas);
        if cost == 0 || self.hourly_limit == 0 {
            return Err(BOOST_SPONSOR_LIMIT.to_string());
        }
        let hour = unix_secs.div_euclid(HOUR_SECS);
        let day = unix_secs.div_euclid(DAY_SECS);
        let hourly_key = (account.to_string(), hour);
        let mut counters = self
            .counters
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        counters
            .hourly
            .retain(|(_, stored_hour), _| *stored_hour >= hour.saturating_sub(1));
        counters
            .fleet_daily
            .retain(|stored_day, _| *stored_day >= day.saturating_sub(1));

        let used_count = counters.hourly.get(&hourly_key).copied().unwrap_or(0);
        if used_count >= self.hourly_limit {
            return Err(BOOST_SPONSOR_LIMIT.to_string());
        }
        let spent = counters.fleet_daily.get(&day).copied().unwrap_or(0);
        let next_spend = spent.saturating_add(cost);
        if next_spend > self.fleet_daily_cap_yocto {
            return Err(BOOST_SPONSOR_LIMIT.to_string());
        }
        counters.hourly.insert(hourly_key, used_count + 1);
        counters.fleet_daily.insert(day, next_spend);
        Ok(cost)
    }

    pub fn release_at(&self, account: &AccountId, cost: u128, unix_secs: i64) {
        if cost == 0 {
            return;
        }
        let hour = unix_secs.div_euclid(HOUR_SECS);
        let day = unix_secs.div_euclid(DAY_SECS);
        let hourly_key = (account.to_string(), hour);
        let mut counters = self
            .counters
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if let Some(count) = counters.hourly.get_mut(&hourly_key) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                counters.hourly.remove(&hourly_key);
            }
        }
        if let Some(spent) = counters.fleet_daily.get_mut(&day) {
            *spent = spent.saturating_sub(cost);
            if *spent == 0 {
                counters.fleet_daily.remove(&day);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_primitives::transaction::{FunctionCallAction, TransferAction};

    fn function_call(method_name: &str, args: Vec<u8>, gas: u64, deposit_yocto: u128) -> Action {
        Action::FunctionCall(Box::new(FunctionCallAction {
            method_name: method_name.to_string(),
            args,
            gas: near_primitives::gas::Gas::from_gas(gas),
            deposit: near_token::NearToken::from_yoctonear(deposit_yocto),
        }))
    }

    fn transfer_action(deposit_yocto: u128) -> Action {
        Action::Transfer(TransferAction {
            deposit: near_token::NearToken::from_yoctonear(deposit_yocto),
        })
    }

    fn policy() -> SponsorPolicy {
        SponsorPolicy {
            token_contract_id: "token.onsocial.testnet".parse().unwrap(),
            boost_contract_id: "boost.onsocial.testnet".parse().unwrap(),
            allowed_methods: vec!["execute".into(), "execute_admin".into()],
        }
    }

    fn token() -> AccountId {
        "token.onsocial.testnet".parse().unwrap()
    }

    fn boost_args(receiver: &str) -> Vec<u8> {
        serde_json::to_vec(&serde_json::json!({
            "receiver_id": receiver,
            "amount": "1000000000000000000",
            "msg": "{\"action\":\"lock\",\"months\":12}"
        }))
        .unwrap()
    }

    fn boost_call(receiver: &str, deposit: u128) -> Action {
        function_call(
            FT_TRANSFER_CALL_METHOD,
            boost_args(receiver),
            80_000_000_000_000,
            deposit,
        )
    }

    #[test]
    fn allowed_boost_receiver_passes() {
        let sponsored = validate_delegate_actions(
            &token(),
            &[boost_call("boost.onsocial.testnet", 1)],
            &policy(),
        )
        .unwrap()
        .expect("sponsored");
        assert_eq!(sponsored.gas, 80_000_000_000_000);
    }

    #[test]
    fn other_receiver_is_rejected() {
        let err = validate_delegate_actions(&token(), &[boost_call("alice.testnet", 1)], &policy())
            .unwrap_err();
        assert!(err.contains("receiver_id must be boost.onsocial.testnet"));
    }

    #[test]
    fn substring_memo_does_not_count_as_the_receiver() {
        let args = serde_json::to_vec(&serde_json::json!({
            "memo": "pay boost.onsocial.testnet please",
            "receiver_id": "social-spend.onsocial.testnet",
            "amount": "1",
            "msg": ""
        }))
        .unwrap();
        let action = function_call(FT_TRANSFER_CALL_METHOD, args, 1, 1);
        let err = validate_delegate_actions(&token(), &[action], &policy()).unwrap_err();
        assert!(err.contains("receiver_id must be boost.onsocial.testnet"));
    }

    #[test]
    fn non_json_args_that_mention_the_boost_account_are_rejected() {
        let args = b"receiver_id=boost.onsocial.testnet".to_vec();
        let action = function_call(FT_TRANSFER_CALL_METHOD, args, 1, 1);
        let err = validate_delegate_actions(&token(), &[action], &policy()).unwrap_err();
        assert!(err.contains("JSON object"));
    }

    #[test]
    fn ft_transfer_is_rejected() {
        let action = function_call(
            FT_TRANSFER_METHOD,
            boost_args("boost.onsocial.testnet"),
            1,
            1,
        );
        let err = validate_delegate_actions(&token(), &[action], &policy()).unwrap_err();
        assert!(err.contains("Inner method not allowed: ft_transfer"));
    }

    #[test]
    fn wrong_deposit_is_rejected() {
        for deposit in [0_u128, 2_u128] {
            let err = validate_delegate_actions(
                &token(),
                &[boost_call("boost.onsocial.testnet", deposit)],
                &policy(),
            )
            .unwrap_err();
            assert!(
                err.contains("exactly 1 yoctoNEAR"),
                "deposit {deposit}: {err}"
            );
        }
    }

    #[test]
    fn extra_actions_are_rejected() {
        let err = validate_delegate_actions(
            &token(),
            &[
                boost_call("boost.onsocial.testnet", 1),
                boost_call("boost.onsocial.testnet", 1),
            ],
            &policy(),
        )
        .unwrap_err();
        assert!(err.contains("single action"));

        let smuggled = transfer_action(1);
        let err = validate_delegate_actions(
            &token(),
            &[boost_call("boost.onsocial.testnet", 1), smuggled],
            &policy(),
        )
        .unwrap_err();
        assert!(err.contains("single action"));
    }

    #[test]
    fn token_methods_on_another_contract_are_rejected() {
        let mut open = policy();
        open.allowed_methods
            .push(FT_TRANSFER_CALL_METHOD.to_string());
        let core: AccountId = "core.onsocial.testnet".parse().unwrap();
        let err =
            validate_delegate_actions(&core, &[boost_call("boost.onsocial.testnet", 1)], &open)
                .unwrap_err();
        assert!(err.contains("SOCIAL token contract"));
    }

    #[test]
    fn ordinary_execute_on_core_still_passes() {
        let core: AccountId = "core.onsocial.testnet".parse().unwrap();
        let action = function_call("execute", b"{}".to_vec(), 1, 1);
        assert!(validate_delegate_actions(&core, &[action], &policy())
            .unwrap()
            .is_none());
    }

    fn open_quota(hourly: u32, fleet: u128) -> SponsorQuota {
        SponsorQuota::new(hourly, fleet, 1)
    }

    #[test]
    fn hourly_limit_allows_under_and_at_and_rejects_over() {
        let quota = open_quota(2, 1_000);
        let account: AccountId = "alice.testnet".parse().unwrap();
        let hour = 3_600 * 4;

        assert_eq!(quota.try_consume_at(&account, 1, hour).unwrap(), 1);
        assert_eq!(quota.try_consume_at(&account, 1, hour + 10).unwrap(), 1);
        assert_eq!(
            quota.try_consume_at(&account, 1, hour + 20).unwrap_err(),
            BOOST_SPONSOR_LIMIT
        );
    }

    #[test]
    fn hour_rollover_resets_the_account_count() {
        let quota = open_quota(1, 1_000);
        let account: AccountId = "alice.testnet".parse().unwrap();
        let hour = 3_600 * 4;
        assert_eq!(quota.try_consume_at(&account, 1, hour).unwrap(), 1);
        assert!(quota.try_consume_at(&account, 1, hour).is_err());
        assert_eq!(
            quota.try_consume_at(&account, 1, hour + HOUR_SECS).unwrap(),
            1
        );
    }

    #[test]
    fn fleet_daily_spend_allows_under_and_at_and_rejects_over() {
        let quota = open_quota(10, 100);
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let bob: AccountId = "bob.testnet".parse().unwrap();
        let day = 86_400 * 3;

        assert_eq!(quota.try_consume_at(&alice, 40, day).unwrap(), 40);
        assert_eq!(quota.try_consume_at(&bob, 60, day).unwrap(), 60);
        assert_eq!(
            quota.try_consume_at(&alice, 1, day).unwrap_err(),
            BOOST_SPONSOR_LIMIT
        );
    }

    #[test]
    fn fleet_over_from_zero_does_not_stick() {
        let quota = open_quota(10, 100);
        let account: AccountId = "alice.testnet".parse().unwrap();
        assert_eq!(
            quota.try_consume_at(&account, 101, 50).unwrap_err(),
            BOOST_SPONSOR_LIMIT
        );
        assert_eq!(quota.try_consume_at(&account, 100, 50).unwrap(), 100);
    }

    #[test]
    fn day_rollover_resets_fleet_spend() {
        let quota = open_quota(10, 100);
        let account: AccountId = "alice.testnet".parse().unwrap();
        let first = 86_400 * 10 + 10;
        assert_eq!(quota.try_consume_at(&account, 100, first).unwrap(), 100);
        assert!(quota.try_consume_at(&account, 1, first).is_err());
        assert_eq!(
            quota
                .try_consume_at(&account, 100, first + DAY_SECS)
                .unwrap(),
            100
        );
    }

    #[test]
    fn release_restores_the_hour_and_the_fleet() {
        let quota = open_quota(1, 100);
        let account: AccountId = "alice.testnet".parse().unwrap();
        let cost = quota.try_consume_at(&account, 80, 10).unwrap();
        assert!(quota.try_consume_at(&account, 1, 10).is_err());
        quota.release_at(&account, cost, 10);
        assert_eq!(quota.try_consume_at(&account, 80, 10).unwrap(), 80);
    }

    #[test]
    fn another_account_is_not_blocked_by_the_hourly_count() {
        let quota = open_quota(1, 1_000);
        let alice: AccountId = "alice.testnet".parse().unwrap();
        let bob: AccountId = "bob.testnet".parse().unwrap();
        assert_eq!(quota.try_consume_at(&alice, 1, 10).unwrap(), 1);
        assert!(quota.try_consume_at(&alice, 1, 10).is_err());
        assert_eq!(quota.try_consume_at(&bob, 1, 10).unwrap(), 1);
    }

    #[test]
    fn defaults_allow_several_boosts_and_bound_the_fleet() {
        assert_eq!(DEFAULT_HOURLY_LIMIT, 6);
        assert_eq!(
            DEFAULT_FLEET_DAILY_SPEND_YOCTO,
            1_000_000_000_000_000_000_000_000
        );
        let quota = SponsorQuota::new(
            DEFAULT_HOURLY_LIMIT,
            DEFAULT_FLEET_DAILY_SPEND_YOCTO,
            DEFAULT_GAS_PRICE_YOCTO,
        );
        let one_boost = quota.cost_yocto(80_000_000_000_000);
        assert!(
            one_boost.saturating_mul(u128::from(DEFAULT_HOURLY_LIMIT))
                < DEFAULT_FLEET_DAILY_SPEND_YOCTO
        );
        assert!(one_boost < DEFAULT_FLEET_DAILY_SPEND_YOCTO);
    }
}
