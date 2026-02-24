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
    pub total_fee_bps: u16,
    pub app_pool_fee_bps: u16,
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

impl FeeConfig {
    pub fn validate_patch(&self, patch: &FeeConfigUpdate) -> Result<(), MarketplaceError> {
        let total = patch.total_fee_bps.unwrap_or(self.total_fee_bps);
        let app = patch.app_pool_fee_bps.unwrap_or(self.app_pool_fee_bps);
        let platform = patch
            .platform_storage_fee_bps
            .unwrap_or(self.platform_storage_fee_bps);

        if !(MIN_TOTAL_FEE_BPS..=MAX_TOTAL_FEE_BPS).contains(&total) {
            return Err(MarketplaceError::InvalidInput(format!(
                "total_fee_bps must be {MIN_TOTAL_FEE_BPS}..={MAX_TOTAL_FEE_BPS}"
            )));
        }
        if app + platform > total {
            return Err(MarketplaceError::InvalidInput(
                "app_pool_fee_bps + platform_storage_fee_bps cannot exceed total_fee_bps".into(),
            ));
        }
        if app.max(platform) < MIN_POOL_FEE_BPS {
            return Err(MarketplaceError::InvalidInput(format!(
                "at least one pool fee must be >= {MIN_POOL_FEE_BPS} bps"
            )));
        }
        if app > MAX_POOL_FEE_BPS || platform > MAX_POOL_FEE_BPS {
            return Err(MarketplaceError::InvalidInput(format!(
                "each pool fee must be <= {MAX_POOL_FEE_BPS} bps"
            )));
        }
        Ok(())
    }

    pub fn apply_patch(&mut self, patch: &FeeConfigUpdate) {
        if let Some(v) = patch.total_fee_bps {
            self.total_fee_bps = v;
        }
        if let Some(v) = patch.app_pool_fee_bps {
            self.app_pool_fee_bps = v;
        }
        if let Some(v) = patch.platform_storage_fee_bps {
            self.platform_storage_fee_bps = v;
        }
    }
}

#[near(serializers = [json])]
#[derive(Clone, Default)]
pub struct FeeConfigUpdate {
    pub total_fee_bps: Option<u16>,
    pub app_pool_fee_bps: Option<u16>,
    pub platform_storage_fee_bps: Option<u16>,
}
