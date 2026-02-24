// --- Test Modules ---
pub mod test_utils;

// --- Unit Tests ---
pub mod unit {
    pub mod admin_test;
    pub mod app_pool_test;
    pub mod approval_test;
    pub mod auction_settle_test;
    pub mod collection_manage_test;
    pub mod collection_mint_test;
    pub mod collection_offer_test;
    pub mod collection_purchase_test;
    pub mod collections_test;
    pub mod dispatch_test;
    pub mod fee_routing_test;
    pub mod fees_test;
    pub mod guards_test;
    pub mod lazy_listing_test;
    pub mod lifecycle_test;
    pub mod metadata_template_test;
    pub mod moderation_test;
    pub mod offer_test;
    pub mod pricing_test;
    pub mod royalty_test;
    pub mod sale_test;
    pub mod scarce_test;
    pub mod storage_test;
    pub mod validation_test;

    // --- View & entrypoint coverage ---
    pub mod app_pool_views_test;
    pub mod collection_views_test;
    pub mod enumeration_test;
    pub mod ft_receiver_test;
    pub mod lazy_listing_cleanup_test;
    pub mod lazy_listing_views_test;
    pub mod metadata_platform_test;
    pub mod payout_test;
    pub mod prepaid_balance_test;
    pub mod refund_test;
    pub mod sale_views_test;
    pub mod scarce_views_test;
    pub mod spending_protection_test;
    pub mod storage_deposit_test;
}
