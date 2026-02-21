//! Fee domain types.

use crate::*;

pub(crate) struct PrimarySaleResult {
    pub revenue: u128,
    pub app_pool_amount: u128,
    pub app_commission: u128,
    pub creator_payment: u128,
}

#[near(serializers = [borsh, json])]
#[derive(Clone)]
pub struct FeeConfig {
    /// 200 = 2.0%.
    pub total_fee_bps: u16,
    /// Portion of `total_fee_bps` to app pool (50 = 0.5%). Applied only when a pool is registered.
    pub app_pool_fee_bps: u16,
    /// Portion of `total_fee_bps` (no app_id) to platform storage pool (50 = 0.5%).
    pub platform_storage_fee_bps: u16,
}

impl Default for FeeConfig {
    fn default() -> Self {
        Self {
            total_fee_bps: DEFAULT_TOTAL_FEE_BPS,
            app_pool_fee_bps: DEFAULT_APP_POOL_FEE_BPS,
            platform_storage_fee_bps: DEFAULT_PLATFORM_STORAGE_FEE_BPS,
        }
    }
}
