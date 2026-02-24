use crate::*;

// --- FeeConfig::default ---

#[test]
fn default_fee_config_values() {
    let cfg = FeeConfig::default();
    assert_eq!(cfg.total_fee_bps, DEFAULT_TOTAL_FEE_BPS);
    assert_eq!(cfg.app_pool_fee_bps, DEFAULT_APP_POOL_FEE_BPS);
    assert_eq!(
        cfg.platform_storage_fee_bps,
        DEFAULT_PLATFORM_STORAGE_FEE_BPS
    );
}

#[test]
fn default_fee_invariant_parts_le_total() {
    let cfg = FeeConfig::default();
    assert!(cfg.app_pool_fee_bps <= cfg.total_fee_bps);
    assert!(cfg.platform_storage_fee_bps <= cfg.total_fee_bps);
}

// --- Constants sanity ---

#[test]
fn max_royalty_is_50_percent() {
    assert_eq!(MAX_ROYALTY_BPS, 5_000);
}

#[test]
fn basis_points_is_10000() {
    assert_eq!(BASIS_POINTS, 10_000);
}

#[test]
fn one_yocto_is_one() {
    assert_eq!(ONE_YOCTO.as_yoctonear(), 1);
}
