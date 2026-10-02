//! Dollar stickers settled in NEAR.
//!
//! The price record lives in its own storage key, beside `Sale` and the other
//! listing records, so an upgrade does not rewrite existing state. A listing
//! with no dollar record still sells for its stored NEAR amount. Auctions stay
//! in NEAR.
//!
//! At purchase this contract asks the price oracle for NEAR/USD. The oracle
//! returns the price to the settle callback, which charges that NEAR and
//! refunds the rest. Intents is not the price.

use crate::*;
use near_sdk::json_types::U128;
use near_sdk::store::LookupMap;
use near_sdk::{AccountId, Gas, NearToken, Promise, ext_contract, near};
use primitive_types::U256;

/// The oracle returns NEAR/USD to the settle callback. The buyer's transaction
/// is capped at 300 TGas, so the request and the settle callback share that
/// budget.
const GAS_ORACLE_CALL: u64 = 150;
const GAS_DOLLAR_SETTLE: u64 = 130;
/// The oracle charges about 0.01 NEAR to fetch a fresh price.
const ORACLE_CALL_DEPOSIT: u128 = 10_000_000_000_000_000_000_000;

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
    /// Oracle account, e.g. `price-oracle.near`.
    pub oracle_contract: AccountId,
    /// Asset id the oracle prices, e.g. `wrap.near`.
    pub asset_id: String,
    /// Reject a price older than this many seconds.
    pub max_age_seconds: u32,
}

#[allow(dead_code)]
#[ext_contract(ext_dollar_oracle)]
trait DollarOracleCall {
    fn request_price_data(
        &mut self,
        asset_ids: Option<Vec<String>>,
        resource_limits: Option<near_sdk::serde_json::Value>,
    );
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

    /// NEAR yocto that `usd_e6` is worth at the oracle price.
    ///
    /// `price` is the oracle multiplier and `expo` is its exponent, almost
    /// always -8. One NEAR is `price * 10^expo` dollars.
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

/// Pull the asset price out of an oracle `PriceData` JSON result.
/// Returns the price integer, its exponent, and the publish time in seconds.
pub(crate) fn parse_oracle_price(
    bytes: &[u8],
    asset_id: &str,
) -> Result<(u128, i32, u64), MarketplaceError> {
    let value: near_sdk::serde_json::Value = near_sdk::serde_json::from_slice(bytes)
        .map_err(|_| MarketplaceError::InvalidState("Oracle price was not readable".into()))?;
    if value.is_null() {
        return Err(MarketplaceError::InvalidState(
            "Oracle price is missing".into(),
        ));
    }
    let timestamp_ns = value
        .get("timestamp")
        .and_then(parse_u128_field)
        .ok_or_else(|| MarketplaceError::InvalidState("Oracle price was not readable".into()))?;
    let prices = value
        .get("prices")
        .and_then(|p| p.as_array())
        .ok_or_else(|| MarketplaceError::InvalidState("Oracle price was not readable".into()))?;
    let entry = prices
        .iter()
        .find(|p| p.get("asset_id").and_then(|a| a.as_str()) == Some(asset_id))
        .ok_or_else(|| {
            MarketplaceError::InvalidState("Oracle did not return the NEAR price".into())
        })?;
    let price_obj = entry.get("price").filter(|p| !p.is_null()).ok_or_else(|| {
        MarketplaceError::InvalidState("Oracle price is missing or too old".into())
    })?;
    let multiplier = price_obj
        .get("multiplier")
        .and_then(parse_u128_field)
        .filter(|m| *m > 0)
        .ok_or_else(|| MarketplaceError::InvalidState("Oracle price must be positive".into()))?;
    let decimals = price_obj
        .get("decimals")
        .and_then(parse_i64_field)
        .ok_or_else(|| MarketplaceError::InvalidState("Oracle price was not readable".into()))?;
    if decimals < 0 || decimals > i32::MAX as i64 {
        return Err(MarketplaceError::InvalidState(
            "Oracle price was not readable".into(),
        ));
    }
    let publish_time = u64::try_from(timestamp_ns / 1_000_000_000).map_err(|_| {
        MarketplaceError::InvalidState("Oracle price was not readable".into())
    })?;
    Ok((multiplier, -(decimals as i32), publish_time))
}

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn set_dollar_oracle(
        &mut self,
        oracle_contract: AccountId,
        asset_id: String,
        max_age_seconds: u32,
    ) -> Result<(), MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        let asset_id = asset_id.trim().to_string();
        if asset_id.is_empty() || asset_id.len() > 128 {
            return Err(MarketplaceError::InvalidInput(
                "Oracle asset id is missing".into(),
            ));
        }
        if max_age_seconds == 0 || max_age_seconds > 3_600 {
            return Err(MarketplaceError::InvalidInput(
                "Price age must be between 1 second and 1 hour".into(),
            ));
        }
        let mut store = oracle_store();
        store.insert(
            0,
            DollarOracle {
                oracle_contract,
                asset_id,
                max_age_seconds,
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
    /// Attach `max_near` plus the oracle fetch fee. The contract asks the
    /// oracle for NEAR/USD and settles in the callback.
    #[payable]
    #[handle_result]
    pub fn purchase_dollar(
        &mut self,
        scope: String,
        id: String,
        quantity: u32,
        max_near: U128,
    ) -> Result<Promise, MarketplaceError> {
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
        let payment = attached.checked_sub(ORACLE_CALL_DEPOSIT).ok_or_else(|| {
            MarketplaceError::InsufficientDeposit(
                "Attach the maximum NEAR plus the oracle fetch fee".into(),
            )
        })?;
        if payment < max_near.0 || max_near.0 == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Attach at least the maximum NEAR you agree to pay".into(),
            ));
        }
        let buyer = env::predecessor_account_id();
        Ok(ext_dollar_oracle::ext(oracle.oracle_contract)
            .with_attached_deposit(NearToken::from_yoctonear(ORACLE_CALL_DEPOSIT))
            .with_static_gas(Gas::from_tgas(GAS_ORACLE_CALL))
            .request_price_data(Some(vec![oracle.asset_id]), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(Gas::from_tgas(GAS_DOLLAR_SETTLE))
                    .dollar_settle(buyer, scope, id, qty, max_near, U128(payment)),
            ))
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
        let Some(oracle) = self.get_dollar_oracle() else {
            refund(payment.0, &buyer_id);
            return;
        };
        let (price, expo, publish_time) = match parse_oracle_price(&bytes, &oracle.asset_id) {
            Ok(parsed) => parsed,
            Err(err) => {
                env::log_str(&err.to_string());
                refund(payment.0, &buyer_id);
                return;
            }
        };
        let now = env::block_timestamp() / 1_000_000_000;
        if now.saturating_sub(publish_time) > oracle.max_age_seconds as u64 {
            env::log_str("Oracle price is too old");
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
    fn expo_minus_eight_scales_the_oracle_multiplier() {
        // $1 with multiplier 100_000_000 and expo -8 is $1 per NEAR.
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
}
