//! Price oracle stand-in for sandbox purchases.
//!
//! `request_price_data` returns the same `PriceData` JSON the real oracle
//! (`price-oracle.near`) returns on its fresh-cache path, so the scarce
//! contract's settle callback reads an identical promise result. The price and
//! publish time are set at init so a test can move the price or make it stale.

use near_sdk::{env, near, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct MockOracle {
    multiplier: String,
    decimals: u8,
    /// Publish time in seconds. Zero means "now" at call time.
    publish_time: u64,
    fail_calls: bool,
}

#[near(serializers = [json])]
pub struct Price {
    multiplier: String,
    decimals: u8,
}

#[near(serializers = [json])]
pub struct AssetOptionalPrice {
    asset_id: String,
    price: Option<Price>,
}

#[near(serializers = [json])]
pub struct PriceData {
    /// Nanoseconds, as a decimal string like the real oracle.
    timestamp: String,
    recency_duration_sec: u32,
    prices: Vec<AssetOptionalPrice>,
}

#[near]
impl MockOracle {
    #[init]
    pub fn new(multiplier: String, decimals: u8, publish_time: u64) -> Self {
        Self {
            multiplier,
            decimals,
            publish_time,
            fail_calls: false,
        }
    }

    pub fn set_quote(&mut self, multiplier: String, publish_time: u64) {
        self.multiplier = multiplier;
        self.publish_time = publish_time;
    }

    pub fn set_fail_calls(&mut self, fail: bool) {
        self.fail_calls = fail;
    }

    #[payable]
    pub fn request_price_data(
        &mut self,
        asset_ids: Option<Vec<String>>,
        resource_limits: Option<near_sdk::serde_json::Value>,
    ) -> PriceData {
        let _ = resource_limits;
        if self.fail_calls {
            env::panic_str("Oracle call rejected");
        }
        let asset_id = asset_ids
            .and_then(|ids| ids.into_iter().next())
            .unwrap_or_else(|| "wrap.near".to_string());
        let publish_time = if self.publish_time == 0 {
            env::block_timestamp() / 1_000_000_000
        } else {
            self.publish_time
        };
        PriceData {
            timestamp: format!("{publish_time}000000000"),
            recency_duration_sec: 600,
            prices: vec![AssetOptionalPrice {
                asset_id,
                price: Some(Price {
                    multiplier: self.multiplier.clone(),
                    decimals: self.decimals,
                }),
            }],
        }
    }
}
