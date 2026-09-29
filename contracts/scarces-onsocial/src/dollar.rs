//! Dollar stickers settled in NEAR.
//!
//! The price record lives in its own storage key, beside `Sale` and the other
//! listing records, so an upgrade does not rewrite existing state. A listing
//! with no dollar record still sells for its stored NEAR amount. Auctions stay
//! in NEAR.
//!
//! At purchase the buyer submits a Pyth price update. This contract asks the
//! Pyth oracle to accept it, reads NEAR/USD, and charges that NEAR. Intents is
//! not the price.

use crate::*;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{AccountId, Gas, NearToken, Promise, ext_contract, near};
use primitive_types::U256;

/// Pyth's update schedules a Wormhole verify (~90 TGas of child promises).
/// The buyer's transaction is capped at 300 TGas, so this call and the
/// read/settle callback have to share that budget.
const GAS_PYTH_UPDATE: u64 = 150;
const GAS_PYTH_READ: u64 = 20;
const GAS_DOLLAR_SETTLE: u64 = 100;
/// Covers the price read, the settle callback, and this step's own execution.
const GAS_DOLLAR_READ: u64 = 135;

pub(crate) const DOLLAR_SCOPE_SALE: &str = "sale";
pub(crate) const DOLLAR_SCOPE_LAZY: &str = "lazy";
pub(crate) const DOLLAR_SCOPE_COLLECTION: &str = "collection";

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct DollarPrice {
    /// Sticker in millionths of a dollar. $50 is 50_000_000.
    pub usd_e6: U128,
    /// Least NEAR the seller will accept for one item. Zero means no floor.
    pub min_near: U128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct DollarOracle {
    pub pyth_contract: AccountId,
    /// Hex price id, no `0x` prefix.
    pub price_id: String,
    pub max_age_seconds: u32,
    /// Reject the price when Pyth's confidence is wider than this, in basis points.
    pub max_conf_bps: u16,
}

#[allow(dead_code)]
#[ext_contract(ext_dollar_pyth)]
trait DollarPyth {
    fn update_price_feeds(&mut self, data: String);
    fn get_price_no_older_than(&self, price_id: String, age: u64);
}

fn dollar_key(scope: &str, id: &str) -> String {
    format!("{scope}:{id}")
}

fn dollar_store() -> LookupMap<String, DollarPrice> {
    LookupMap::new(StorageKey::DollarPrices)
}

fn oracle_store() -> LookupMap<u8, DollarOracle> {
    LookupMap::new(StorageKey::DollarOracle)
}

impl Contract {
    pub(crate) fn dollar_price(&self, scope: &str, id: &str) -> Option<DollarPrice> {
        dollar_store().get(&dollar_key(scope, id)).cloned()
    }

    pub(crate) fn clear_dollar(&mut self, scope: &str, id: &str, refund_to: &AccountId) {
        let before = self.storage_usage_flushed();
        let mut store = dollar_store();
        store.remove(&dollar_key(scope, id));
        let freed = before.saturating_sub(self.storage_usage_flushed());
        if freed > 0 {
            self.release_storage_waterfall(refund_to, freed, None);
        }
    }

    pub(crate) fn validate_dollar_listing(
        &self,
        scope: &str,
        id: &str,
        usd_e6: u128,
    ) -> Result<(), MarketplaceError> {
        self.validate_new_dollar(scope, id, usd_e6)
    }

    pub(crate) fn write_dollar(
        &mut self,
        scope: &str,
        id: &str,
        usd_e6: u128,
        min_near: u128,
        actor_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        self.validate_new_dollar(scope, id, usd_e6)?;
        let before = self.storage_usage_flushed();
        let mut store = dollar_store();
        store.insert(
            dollar_key(scope, id),
            DollarPrice {
                usd_e6: U128(usd_e6),
                min_near: U128(min_near),
            },
        );
        let after = self.storage_usage_flushed();
        if after > before {
            // A failed charge panics so the listing change in this receipt reverts
            // with the unpaid sticker. Returning Err would keep the 1-yocto floor.
            if let Err(err) = self.charge_storage_waterfall(actor_id, after - before, None) {
                env::panic_str(&format!("Dollar price storage: {err}"));
            }
        } else if before > after {
            self.release_storage_waterfall(actor_id, before - after, None);
        }
        Ok(())
    }

    fn validate_new_dollar(
        &self,
        scope: &str,
        id: &str,
        usd_e6: u128,
    ) -> Result<(), MarketplaceError> {
        if usd_e6 == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Dollar price must be greater than 0".into(),
            ));
        }
        if scope == DOLLAR_SCOPE_SALE {
            let sale_id = Contract::make_sale_id(&env::current_account_id(), id);
            if let Some(sale) = self.sales.get(&sale_id) {
                if sale.auction.is_some() {
                    return Err(MarketplaceError::InvalidInput(
                        "Auctions stay priced in NEAR".into(),
                    ));
                }
            }
        }
        if scope == DOLLAR_SCOPE_COLLECTION {
            if let Some(collection) = self.collections.get(&id.to_string()) {
                if collection.start_price.is_some() {
                    return Err(MarketplaceError::InvalidInput(
                        "A Dutch auction stays priced in NEAR".into(),
                    ));
                }
            }
        }
        Ok(())
    }

    pub(crate) fn stored_near_for_dollar(min_near: u128) -> U128 {
        U128(min_near.max(1))
    }

    /// NEAR yocto that `usd_e6` is worth at a Pyth price.
    ///
    /// `price` is the Pyth integer and `expo` is its exponent, almost always -8.
    /// One NEAR is `price * 10^expo` dollars.
    pub(crate) fn yocto_for_usd(
        usd_e6: u128,
        price: u128,
        expo: i32,
    ) -> Result<u128, MarketplaceError> {
        if usd_e6 == 0 || price == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Dollar price and NEAR price must be greater than 0".into(),
            ));
        }
        if expo > 18 {
            return Err(MarketplaceError::InvalidInput(
                "NEAR price exponent is not usable".into(),
            ));
        }
        let scale_pow = (18 - expo) as u32;
        let mut scale = U256::from(1u128);
        let ten = U256::from(10u128);
        for _ in 0..scale_pow {
            scale = scale.checked_mul(ten).ok_or_else(|| {
                MarketplaceError::InternalError("Dollar conversion overflow".into())
            })?;
        }
        let yocto = U256::from(usd_e6)
            .checked_mul(scale)
            .ok_or_else(|| MarketplaceError::InternalError("Dollar conversion overflow".into()))?
            / U256::from(price);
        if yocto > U256::from(u128::MAX) {
            return Err(MarketplaceError::InternalError(
                "Dollar conversion overflow".into(),
            ));
        }
        let out = yocto.as_u128();
        if out == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Dollar price converts to 0 NEAR".into(),
            ));
        }
        Ok(out)
    }

    pub(crate) fn bound_dollar_near(
        unit_near: u128,
        quantity: u32,
        min_near: u128,
        max_near: u128,
    ) -> Result<u128, MarketplaceError> {
        if quantity == 0 {
            return Err(MarketplaceError::InvalidInput(
                "Quantity must be at least 1".into(),
            ));
        }
        if min_near > 0 && unit_near < min_near {
            return Err(MarketplaceError::InvalidInput(
                "NEAR price is below the seller minimum".into(),
            ));
        }
        let total = unit_near
            .checked_mul(quantity as u128)
            .ok_or_else(|| MarketplaceError::InternalError("Dollar conversion overflow".into()))?;
        if total > max_near {
            return Err(MarketplaceError::InvalidInput(
                "NEAR price is above the buyer maximum".into(),
            ));
        }
        Ok(total)
    }
}

fn parse_u128_field(value: &near_sdk::serde_json::Value) -> Option<u128> {
    match value {
        near_sdk::serde_json::Value::String(text) => text.parse().ok(),
        near_sdk::serde_json::Value::Number(number) => number.as_u64().map(|n| n as u128),
        _ => None,
    }
}

fn parse_i64_field(value: &near_sdk::serde_json::Value) -> Option<i64> {
    match value {
        near_sdk::serde_json::Value::String(text) => text.parse().ok(),
        near_sdk::serde_json::Value::Number(number) => number.as_i64(),
        _ => None,
    }
}

/// Pull `price`, `conf`, and `expo` out of a Pyth `get_price` JSON result.
pub(crate) fn parse_pyth_price(bytes: &[u8]) -> Result<(u128, u128, i32), MarketplaceError> {
    let value: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(bytes)
        .map_err(|_| MarketplaceError::InvalidState("Pyth price was not readable".into()))?;
    if value.is_null() {
        return Err(MarketplaceError::InvalidState(
            "Pyth price is missing or too old".into(),
        ));
    }
    let price = value
        .get("price")
        .and_then(parse_i64_field)
        .ok_or_else(|| MarketplaceError::InvalidState("Pyth price was not readable".into()))?;
    if price <= 0 {
        return Err(MarketplaceError::InvalidState(
            "Pyth price must be positive".into(),
        ));
    }
    let conf = value
        .get("conf")
        .and_then(parse_u128_field)
        .ok_or_else(|| MarketplaceError::InvalidState("Pyth price was not readable".into()))?;
    let expo = value
        .get("expo")
        .and_then(parse_i64_field)
        .ok_or_else(|| MarketplaceError::InvalidState("Pyth price was not readable".into()))?;
    if expo < i32::MIN as i64 || expo > i32::MAX as i64 {
        return Err(MarketplaceError::InvalidState(
            "Pyth price was not readable".into(),
        ));
    }
    Ok((price as u128, conf, expo as i32))
}

pub(crate) fn confidence_within(price: u128, conf: u128, max_conf_bps: u16) -> bool {
    if price == 0 {
        return false;
    }
    let width = U256::from(conf) * U256::from(10_000u128) / U256::from(price);
    width <= U256::from(max_conf_bps as u128)
}

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn set_dollar_oracle(
        &mut self,
        pyth_contract: AccountId,
        price_id: String,
        max_age_seconds: u32,
        max_conf_bps: u16,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let price_id = price_id.trim_start_matches("0x").to_ascii_lowercase();
        if price_id.len() != 64 || !price_id.chars().all(|c| c.is_ascii_hexdigit()) {
            return Err(MarketplaceError::InvalidInput(
                "Pyth price id must be 32 bytes of hex".into(),
            ));
        }
        if max_age_seconds == 0 || max_age_seconds > 3_600 {
            return Err(MarketplaceError::InvalidInput(
                "Price age must be between 1 second and 1 hour".into(),
            ));
        }
        if max_conf_bps == 0 || max_conf_bps > 1_000 {
            return Err(MarketplaceError::InvalidInput(
                "Confidence band must be between 1 and 1000 bps".into(),
            ));
        }
        let mut store = oracle_store();
        store.insert(
            0,
            DollarOracle {
                pyth_contract,
                price_id,
                max_age_seconds,
                max_conf_bps,
            },
        );
        Ok(())
    }

    pub fn get_dollar_oracle(&self) -> Option<DollarOracle> {
        oracle_store().get(&0).cloned()
    }

    pub fn get_dollar_price(&self, scope: String, id: String) -> Option<DollarPrice> {
        self.dollar_price(&scope, &id)
    }

    /// Buy a dollar-priced sale, lazy listing, or collection.
    ///
    /// Attach `max_near + pyth_fee`. `update_data` is the hex payload from Pyth Hermes.
    #[payable]
    #[handle_result]
    pub fn purchase_dollar(
        &mut self,
        scope: String,
        id: String,
        quantity: u32,
        max_near: U128,
        pyth_fee: U128,
        update_data: String,
    ) -> Result<Promise, MarketplaceError> {
        let update_data = update_data.trim_start_matches("0x").to_string();
        if update_data.is_empty()
            || update_data.len() > 32_000
            || !update_data.chars().all(|c| c.is_ascii_hexdigit())
        {
            return Err(MarketplaceError::InvalidInput(
                "Pyth price update is missing".into(),
            ));
        }
        let qty = if scope == DOLLAR_SCOPE_SALE {
            1
        } else {
            quantity
        };
        if qty == 0 || qty > MAX_BATCH_MINT {
            return Err(MarketplaceError::InvalidInput(format!(
                "Quantity must be 1-{}",
                MAX_BATCH_MINT
            )));
        }
        let _sticker = self.dollar_price(&scope, &id).ok_or_else(|| {
            MarketplaceError::InvalidState("This listing is priced in NEAR".into())
        })?;
        let oracle = self.get_dollar_oracle().ok_or_else(|| {
            MarketplaceError::InvalidState("Dollar prices are not configured".into())
        })?;
        let attached = env::attached_deposit().as_yoctonear();
        let payment = attached.checked_sub(pyth_fee.0).ok_or_else(|| {
            MarketplaceError::InsufficientDeposit(
                "Attach the maximum NEAR plus the Pyth update fee".into(),
            )
        })?;
        if payment < max_near.0 || max_near.0 == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Attach at least the maximum NEAR you agree to pay".into(),
            ));
        }
        let buyer = env::predecessor_account_id();
        Ok(ext_dollar_pyth::ext(oracle.pyth_contract)
            .with_attached_deposit(NearToken::from_yoctonear(pyth_fee.0))
            .with_static_gas(Gas::from_tgas(GAS_PYTH_UPDATE))
            .update_price_feeds(update_data)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(GAS_DOLLAR_READ))
                    .dollar_read_price(buyer, scope, id, qty, max_near, U128(payment)),
            ))
    }

    #[private]
    pub fn dollar_read_price(
        &mut self,
        buyer_id: AccountId,
        scope: String,
        id: String,
        quantity: u32,
        max_near: U128,
        payment: U128,
    ) -> Promise {
        let failed =
            env::promise_results_count() != 1 || env::promise_result_checked(0, 1024).is_err();
        if failed || self.get_dollar_oracle().is_none() {
            return if payment.0 > 0 {
                Promise::new(buyer_id).transfer(NearToken::from_yoctonear(payment.0))
            } else {
                Promise::new(env::current_account_id())
            };
        }
        let oracle = self.get_dollar_oracle().expect("oracle checked");
        ext_dollar_pyth::ext(oracle.pyth_contract)
            .with_static_gas(Gas::from_tgas(GAS_PYTH_READ))
            .get_price_no_older_than(oracle.price_id, oracle.max_age_seconds as u64)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(GAS_DOLLAR_SETTLE))
                    .dollar_settle(buyer_id, scope, id, quantity, max_near, payment),
            )
    }

    #[private]
    pub fn dollar_settle(
        &mut self,
        buyer_id: AccountId,
        scope: String,
        id: String,
        quantity: u32,
        max_near: U128,
        payment: U128,
    ) {
        let refund = |amount: u128, buyer: &AccountId| {
            if amount > 0 {
                Promise::new(buyer.clone())
                    .transfer(NearToken::from_yoctonear(amount))
                    .detach();
            }
        };
        let bytes = match env::promise_result_checked(0, 4_096) {
            Ok(bytes) => bytes,
            Err(_) => {
                refund(payment.0, &buyer_id);
                return;
            }
        };
        let (price, conf, expo) = match parse_pyth_price(&bytes) {
            Ok(parsed) => parsed,
            Err(err) => {
                env::log_str(&err.to_string());
                refund(payment.0, &buyer_id);
                return;
            }
        };
        let Some(oracle) = self.get_dollar_oracle() else {
            refund(payment.0, &buyer_id);
            return;
        };
        if !confidence_within(price, conf, oracle.max_conf_bps) {
            env::log_str("Pyth confidence is too wide");
            refund(payment.0, &buyer_id);
            return;
        }
        let Some(sticker) = self.dollar_price(&scope, &id) else {
            refund(payment.0, &buyer_id);
            return;
        };
        let unit = match Self::yocto_for_usd(sticker.usd_e6.0, price, expo) {
            Ok(unit) => unit,
            Err(err) => {
                env::log_str(&err.to_string());
                refund(payment.0, &buyer_id);
                return;
            }
        };
        let total = match Self::bound_dollar_near(unit, quantity, sticker.min_near.0, max_near.0) {
            Ok(total) => total,
            Err(err) => {
                env::log_str(&err.to_string());
                refund(payment.0, &buyer_id);
                return;
            }
        };
        if total > payment.0 {
            refund(payment.0, &buyer_id);
            return;
        }
        self.dollar_unit_override = Some(unit);
        let settled = if scope == DOLLAR_SCOPE_SALE {
            self.purchase_native_scarce(&buyer_id, id, total)
        } else if scope == DOLLAR_SCOPE_LAZY {
            self.purchase_lazy_listing(&buyer_id, id, quantity, total)
                .map(|_| ())
        } else if scope == DOLLAR_SCOPE_COLLECTION {
            self.purchase_from_collection(&buyer_id, id, quantity, U128(unit), total)
        } else {
            Err(MarketplaceError::InvalidInput(
                "Unknown dollar listing".into(),
            ))
        };
        self.dollar_unit_override = None;
        // Purchase accounting parks unused attached NEAR in a transient balance.
        // This receipt has no attached deposit, so hand the surplus back.
        self.pending_attached_balance = 0;
        match settled {
            Ok(()) => refund(payment.0 - total, &buyer_id),
            Err(err) => {
                env::log_str(&err.to_string());
                refund(payment.0, &buyer_id);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::Contract;

    #[test]
    fn two_dollars_at_two_dollars_per_near_is_one_near() {
        let yocto = Contract::yocto_for_usd(2_000_000, 2, 0).unwrap();
        assert_eq!(yocto, 10u128.pow(24));
    }

    #[test]
    fn expo_minus_eight_scales_the_pyth_integer() {
        // $1 with price 100_000_000 and expo -8 is $1 per NEAR.
        let yocto = Contract::yocto_for_usd(1_000_000, 100_000_000, -8).unwrap();
        assert_eq!(yocto, 10u128.pow(24));
    }

    #[test]
    fn buyer_maximum_stops_a_move() {
        let err = Contract::bound_dollar_near(10, 1, 0, 9).unwrap_err();
        assert!(err.to_string().contains("maximum"));
    }

    #[test]
    fn seller_minimum_stops_dust() {
        let err = Contract::bound_dollar_near(1, 1, 5, 10).unwrap_err();
        assert!(err.to_string().contains("minimum"));
    }

    #[test]
    fn wide_confidence_is_rejected() {
        assert!(super::confidence_within(10_000, 50, 100));
        assert!(!super::confidence_within(10_000, 200, 100));
    }
}
