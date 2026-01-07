// --- Test Modules ---
pub mod test_utils;

// --- Unit Tests ---
pub mod unit {
    pub mod account_validation_test;
    pub mod advanced_functionalities_test;
    pub mod api_edge_cases_test;  // NEW: API edge cases (get_config, has_group_admin_permission, path validation)
    pub mod contract_lifecycle_test;
    pub mod custom_proposal_test;  // Custom proposal workflow tests
    pub mod enhanced_permissions_test;
    pub mod error_message_test;  // NEW: Error message validation tests
    pub mod event_builder_writes_test;  // EventBuilder writes[] merge/dedup invariants
    pub mod event_emission_test;  // NEW: Event emission and format validation tests
    pub mod get_api_test;  // Comprehensive get() API tests
    pub mod governance_test;  // Governance tests
    pub mod governance_status_test;  // Governance status tests
    pub mod group_sponsor_quota_test;
    pub mod group_test;
    pub mod members;  // Group membership tests
    pub mod set_permission_signer_test;  // Security test: set_permission uses signer not predecessor
    // pub mod signed_payload_test;  // DISABLED: References old SetRequest/set() API - needs full rewrite
    pub mod stats_test;  // Group stats counter tests (underflow protection, timestamps)
    pub mod storage_tracking_test;  // Storage tracking correctness tests (validates storage.rs fixes)
    pub mod storage_tracker_helpers_test;
    pub mod voting;   // Voting tests
    pub mod voting_config_test;     // Voting configuration tests
    pub mod voting_edge_cases;      // Voting edge case tests
    pub mod voting_group_updates;   // Voting group update tests
    pub mod voting_proposal_types;  // Voting proposal type tests
}

// --- Integration Tests ---
pub mod integration {
    pub mod comprehensive_integration_test;
    pub mod group_content_integration_test;  // NEW: Group content creation integration tests (CRITICAL)
    pub mod simple_api_test;
    pub mod ultra_simple_api_test;  // Ultra simple API tests
}

// --- Security Tests ---
pub mod security {
    pub mod group_transfer_ownership_security_test;
    pub mod signer_validation;  // NEW: Comprehensive signer vs predecessor security tests
}

// --- Performance Tests ---
pub mod performance {
    pub mod partition_audit;  // Tests partition distribution (namespace-based)
}