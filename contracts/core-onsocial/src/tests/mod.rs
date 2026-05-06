pub mod test_utils;

pub mod unit {
    pub mod account_validation_test;
    pub mod accounting_test;
    pub mod advanced_functionalities_test;
    pub mod api_edge_cases_test;
    pub mod contract_lifecycle_test;
    pub mod custom_proposal_test;
    pub mod enhanced_permissions_test;
    pub mod error_message_test;
    pub mod event_builder_writes_test;
    pub mod event_emission_test;
    pub mod expire_proposal_test;
    pub mod get_api_test;
    pub mod governance_status_test;
    pub mod governance_test;
    pub mod grants_test;
    pub mod group_sponsor_quota_test;
    pub mod group_test;
    pub mod io_operations_test;
    pub mod key_index_test;
    pub mod kv_eval_test;
    pub mod kv_types_test;
    pub mod members;
    pub mod membership_test;
    pub mod proposal_index_test;
    pub mod sdk_parity_test;
    pub mod stats_test;
    pub mod storage_tip_test;
    pub mod storage_tracker_helpers_test;
    pub mod storage_tracking_test;
    pub mod voting;
    pub mod voting_config_test;
    pub mod voting_edge_cases;
    pub mod voting_group_updates;
    pub mod voting_proposal_types;
    pub mod wnear_test;
}

pub mod workflow {
    pub mod comprehensive_workflow_test;
    pub mod group_content_workflow_test;
    pub mod simple_api_test;
    pub mod ultra_simple_api_test;
}

pub mod security {
    pub mod admin_split;
    pub mod group_transfer_ownership_security_test;
    pub mod signer_validation;
}

pub mod performance {
    pub mod partition_audit;
}
