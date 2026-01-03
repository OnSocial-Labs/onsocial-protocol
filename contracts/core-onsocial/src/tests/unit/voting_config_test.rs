// === VOTING CONFIGURATION TESTS ===
// Comprehensive tests for per-group voting configuration and governance-based config changes

#[cfg(test)]
mod voting_config_tests {
    use crate::domain::groups::permissions::kv::MODERATE;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{testing_env, AccountId};

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    // ============================================================================
    // CUSTOM VOTING CONFIG TESTS
    // ============================================================================

    #[test]
    fn test_group_creation_with_custom_voting_config() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group with custom voting config (stricter requirements)
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 5000,  // 50.00% must vote
                "majority_threshold_bps": 6667, // 66.67% must approve
                "voting_period": "1209600000000000" // 14 days
            }
        });
        
        contract.create_group("strict_dao".to_string(), config).unwrap();

        // Verify custom config was stored
        let group_config = contract.get_group_config("strict_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 5000);
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 6667);
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 1209600000000000u64);

        println!("✅ Group created with custom voting configuration");
    }

    #[test]
    fn test_group_creation_with_default_voting_config() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group without specifying voting config (should use defaults)
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
        });
        
        contract.create_group("default_dao".to_string(), config).unwrap();

        // Verify default config was set
        let group_config = contract.get_group_config("default_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 5100);  // Default 51.00%
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 5001); // Default 50.01%
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 7 * 24 * 60 * 60 * 1_000_000_000); // Default 7 days

        println!("✅ Group created with default voting configuration");
    }

    #[test]
    fn test_custom_config_affects_proposal_execution() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        // Create group with custom config requiring higher participation before execution
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 5000,
                "majority_threshold_bps": 6667,
                "voting_period": "604800000000000"
            }
        });
        contract.create_group("supermajority".to_string(), config).unwrap();

        // Add two more members (total 3: alice, bob, charlie)
        let member_data = json!({"level": MODERATE, "granted_by": alice, "joined_at": 0, "is_creator": false});
        contract.platform.storage_set(&format!("groups/supermajority/members/{}", bob.as_str()), &member_data).unwrap();
        contract.platform.storage_set(&format!("groups/supermajority/members/{}", charlie.as_str()), &member_data).unwrap();
        
        let stats = json!({"total_members": 3, "total_join_requests": 0, "created_at": 0, "last_updated": 0});
        contract.platform.storage_set("groups/supermajority/stats", &stats).unwrap();

        // Alice creates proposal (auto YES vote: 1/3 = 33.33% participation < 50% quorum, doesn't execute yet)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({"update_type": "metadata", "changes": {"description": "Test supermajority"}});
        let proposal_id = contract.create_group_proposal("supermajority".to_string(), "group_update".to_string(), proposal_data, None).unwrap();

        // Verify not executed yet (insufficient participation)
        let proposal = contract.platform.storage_get(&format!("groups/supermajority/proposals/{}", proposal_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "active");

        // Bob votes YES - now 2/3 votes cast = 66.67% participation ≥ 50%, 2/2 YES = 100% approval ≥ 66.67%, should execute!
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        contract.vote_on_proposal("supermajority".to_string(), proposal_id.clone(), true).unwrap();

        // Check if executed
        let proposal = contract.platform.storage_get(&format!("groups/supermajority/proposals/{}", proposal_id)).unwrap();
        let status = proposal.get("status").unwrap().as_str().unwrap();
        assert_eq!(status, "executed");

        println!("✅ Custom voting config (participation quorum + majority threshold) correctly applied");
    }

    // ============================================================================
    // VOTING CONFIG CHANGE PROPOSAL TESTS
    // ============================================================================

    #[test]
    fn test_propose_voting_config_change() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create member-driven group with default config
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("evolving_dao".to_string(), config).unwrap();

        // Create proposal to change voting config
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({
            "participation_quorum_bps": 4000,
            "majority_threshold_bps": 7500,
            "voting_period": "259200000000000" // 3 days
        });

        let result = contract.create_group_proposal(
            "evolving_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_ok(), "Should be able to propose voting config change");
        println!("✅ Voting config change proposal created successfully");
    }

    #[test]
    fn test_execute_voting_config_change() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create single-member group (proposals execute immediately with 1 vote)
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("solo_dao".to_string(), config).unwrap();

        // Propose and auto-execute config change (alice is only member)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({
            "participation_quorum_bps": 3300,
            "majority_threshold_bps": 6000,
            "voting_period": "86400000000000" // 1 day
        });

        let proposal_id = contract.create_group_proposal(
            "solo_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        ).unwrap();

        // Verify proposal executed
        let proposal = contract.platform.storage_get(&format!("groups/solo_dao/proposals/{}", proposal_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "executed");

        // Verify config was updated
        let group_config = contract.get_group_config("solo_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 3300);
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 6000);
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 86400000000000u64);

        println!("✅ Voting config changed through governance");
    }

    #[test]
    fn test_new_config_applies_to_subsequent_proposals() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        // Create group with low threshold
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 5100,
                "majority_threshold_bps": 5100,
                "voting_period": "604800000000000"
            }
        });
        contract.create_group("changing_dao".to_string(), config).unwrap();

        // Add bob, charlie, and dave (total 4 members for cleaner math)
        let member_data = json!({"level": MODERATE, "granted_by": alice, "joined_at": 0, "is_creator": false});
        contract.platform.storage_set(&format!("groups/changing_dao/members/{}", bob.as_str()), &member_data).unwrap();
        let charlie = test_account(2);
        contract.platform.storage_set(&format!("groups/changing_dao/members/{}", charlie.as_str()), &member_data).unwrap();
        let dave = test_account(3);
        contract.platform.storage_set(&format!("groups/changing_dao/members/{}", dave.as_str()), &member_data).unwrap();
        let stats = json!({"total_members": 4, "total_join_requests": 0, "created_at": 0, "last_updated": 0});
        contract.platform.storage_set("groups/changing_dao/stats", &stats).unwrap();

        // Change config to require higher participation quorum and threshold
        testing_env!(get_context(alice.clone()).build());
        let config_proposal = json!({
            "participation_quorum_bps": 5000,
            "majority_threshold_bps": 7500
        });
        let config_prop_id = contract.create_group_proposal(
            "changing_dao".to_string(),
            "voting_config_change".to_string(),
            config_proposal,
            None,
        ).unwrap();

        // Alice's vote: 1/4 = 25% participation < 51% quorum, should NOT execute yet
        let proposal = contract.platform.storage_get(&format!("groups/changing_dao/proposals/{}", config_prop_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "active");

        // Bob votes YES - now 2/4 = 50% participation < 51% quorum, should NOT execute yet
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        contract.vote_on_proposal("changing_dao".to_string(), config_prop_id.clone(), true).unwrap();

        let proposal = contract.platform.storage_get(&format!("groups/changing_dao/proposals/{}", config_prop_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "active");

        // Charlie votes YES - now 3/4 = 75% participation ≥ 51%, 3/3 = 100% > 75%, should execute
        testing_env!(get_context_with_deposit(charlie.clone(), 10_000_000_000_000_000_000_000_000).build());
        contract.vote_on_proposal("changing_dao".to_string(), config_prop_id.clone(), true).unwrap();

        // Verify config change executed
        let proposal = contract.platform.storage_get(&format!("groups/changing_dao/proposals/{}", config_prop_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "executed");

        // Now create new proposal with new config in effect (advance time to ensure different proposal ID)
        let mut context = get_context(alice.clone());
        context.block_timestamp(TEST_BASE_TIMESTAMP + 3_600_000_000_000); // +1 hour to get different proposal ID
        testing_env!(context.build());
        let test_proposal = json!({"update_type": "metadata", "changes": {"description": "Testing new config"}});
        let test_prop_id = contract.create_group_proposal(
            "changing_dao".to_string(),
            "group_update".to_string(),
            test_proposal,
            None,
        ).unwrap();

        // Verify IDs are different
        assert_ne!(config_prop_id, test_prop_id, "Proposal IDs should be different");

        // Alice voted YES automatically: 1/4 = 25% participation < 50% quorum (NEW config), should NOT execute yet
        let proposal = contract.platform.storage_get(&format!("groups/changing_dao/proposals/{}", test_prop_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "active");

        // Bob votes YES - now 2/4 = 50% participation = 50% quorum, 2/2 = 100% ≥ 75%, should execute
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        contract.vote_on_proposal("changing_dao".to_string(), test_prop_id.clone(), true).unwrap();

        let proposal = contract.platform.storage_get(&format!("groups/changing_dao/proposals/{}", test_prop_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "executed");

        println!("✅ New voting config correctly applied to subsequent proposals");
    }

    #[test]
    fn test_partial_config_update() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("partial_dao".to_string(), config).unwrap();

        // Update only voting period (keep other params unchanged)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({
            "voting_period": "172800000000000" // 2 days, don't change quorum/threshold
        });

        contract.create_group_proposal(
            "partial_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        ).unwrap();

        // Verify config - period changed, others remain default
        let group_config = contract.get_group_config("partial_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 5100); // Still default
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 5001); // Still default
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 172800000000000u64); // Updated

        println!("✅ Partial voting config update works correctly");
    }

    // ============================================================================
    // VALIDATION TESTS
    // ============================================================================

    #[test]
    fn test_reject_invalid_quorum() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("invalid_dao".to_string(), config).unwrap();

        // Try to set quorum > 100%
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({"participation_quorum_bps": 15000});

        let result = contract.create_group_proposal(
            "invalid_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("between 0 and 10000"));

        // Try to set quorum to an invalid type/value
        let proposal_data = json!({"participation_quorum_bps": "-1"});
        let result = contract.create_group_proposal(
            "invalid_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("Invalid participation_quorum_bps"));

        println!("✅ Invalid quorum values rejected");
    }

    #[test]
    fn test_reject_invalid_threshold() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("invalid_dao2".to_string(), config).unwrap();

        // Try to set threshold > 100%
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({"majority_threshold_bps": 20000});

        let result = contract.create_group_proposal(
            "invalid_dao2".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("between 0 and 10000"));

        println!("✅ Invalid threshold values rejected");
    }

    #[test]
    fn test_reject_invalid_voting_period() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("invalid_dao3".to_string(), config).unwrap();

        // Try to set period too short (< 1 hour)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({"voting_period": "1000000000"}); // 1 second

        let result = contract.create_group_proposal(
            "invalid_dao3".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("between 1 hour and 365 days"));

        // Try to set period too long (> 365 days)
        let proposal_data = json!({"voting_period": 400 * 24 * 60 * 60 * 1_000_000_000u64}); // 400 days
        let result = contract.create_group_proposal(
            "invalid_dao3".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("between 1 hour and 365 days"));

        println!("✅ Invalid voting period values rejected");
    }

    #[test]
    fn test_reject_empty_config_change() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("empty_dao".to_string(), config).unwrap();

        // Try to change config without specifying any parameters
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({});

        let result = contract.create_group_proposal(
            "empty_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("At least one voting config parameter"));

        println!("✅ Empty config change proposal rejected");
    }

    // ============================================================================
    // EDGE CASE TESTS
    // ============================================================================

    #[test]
    fn test_extreme_but_valid_configs() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group with extreme but valid config (very permissive)
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 100,
                "majority_threshold_bps": 5100,
                "voting_period": "3600000000000" // 1 hour
            }
        });
        
        contract.create_group("permissive_dao".to_string(), config).unwrap();

        // Verify it was accepted
        let group_config = contract.get_group_config("permissive_dao".to_string()).unwrap();
        assert!(group_config.get("voting_config").is_some());

        // Create group with extreme but valid config (very strict)
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 9900,
                "majority_threshold_bps": 9900,
                "voting_period": "31536000000000000" // 365 days
            }
        });
        
        contract.create_group("strict_dao".to_string(), config).unwrap();

        // Verify it was accepted
        let group_config = contract.get_group_config("strict_dao".to_string()).unwrap();
        assert!(group_config.get("voting_config").is_some());

        println!("✅ Extreme but valid configurations accepted");
    }

    #[test]
    fn test_multiple_config_changes() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("evolving".to_string(), config).unwrap();

        // First config change
        testing_env!(get_context(alice.clone()).build());
        let proposal1 = json!({"majority_threshold_bps": 6000});
        contract.create_group_proposal("evolving".to_string(), "voting_config_change".to_string(), proposal1, None).unwrap();

        // Second config change
        let proposal2 = json!({"participation_quorum_bps": 3000});
        contract.create_group_proposal("evolving".to_string(), "voting_config_change".to_string(), proposal2, None).unwrap();

        // Third config change
        let proposal3 = json!({"voting_period": "259200000000000"});
        contract.create_group_proposal("evolving".to_string(), "voting_config_change".to_string(), proposal3, None).unwrap();

        // Verify all changes were applied
        let group_config = contract.get_group_config("evolving".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 6000);
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 3000);
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 259200000000000u64);

        println!("✅ Multiple config changes work correctly");
    }

    #[test]
    fn test_config_change_in_traditional_group() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create traditional (non-member-driven) group
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("traditional".to_string(), config).unwrap();

        // Try to create voting config change proposal (should fail - not member-driven)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({"majority_threshold_bps": 6000});

        let result = contract.create_group_proposal(
            "traditional".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        );

        assert!(result.is_err());
        assert!(result.unwrap_err().to_string().contains("not member-driven"));

        println!("✅ Voting config changes only allowed in member-driven groups");
    }

    #[test]
    fn test_multi_member_config_change_voting() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        // Create group with 3 members and default config
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({
            "member_driven": true,
            "is_private": true,
            "voting_config": {
                "participation_quorum_bps": 5100,
                "majority_threshold_bps": 5001,
                "voting_period": "604800000000000" // 7 days
            }
        });
        contract.create_group("vote_test_dao".to_string(), config).unwrap();

        // Add bob and charlie as members (total 3)
        let member_data = json!({"level": MODERATE, "granted_by": alice, "joined_at": 0, "is_creator": false});
        contract.platform.storage_set(&format!("groups/vote_test_dao/members/{}", bob.as_str()), &member_data).unwrap();
        contract.platform.storage_set(&format!("groups/vote_test_dao/members/{}", charlie.as_str()), &member_data).unwrap();
        let stats = json!({"total_members": 3, "total_join_requests": 0, "created_at": 0, "last_updated": 0});
        contract.platform.storage_set("groups/vote_test_dao/stats", &stats).unwrap();

        // Alice proposes config change (auto YES vote: 1/3 = 33.33% < 51%, doesn't execute)
        testing_env!(get_context(alice.clone()).build());
        let proposal_data = json!({
            "participation_quorum_bps": 6600,
            "majority_threshold_bps": 7500,
            "voting_period": "1209600000000000" // Increase to 14 days
        });
        let proposal_id = contract.create_group_proposal(
            "vote_test_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        ).unwrap();

        // Verify proposal is active (not executed yet)
        let proposal = contract.platform.storage_get(&format!("groups/vote_test_dao/proposals/{}", proposal_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "active");

        // Verify config is still old values
        let group_config = contract.get_group_config("vote_test_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 5100);
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 5001);
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 604800000000000u64);

        // Bob votes YES (2/3 = 66.67% ≥ 51%, 2/2 = 100% > 50.01%, should execute!)
        testing_env!(get_context_with_deposit(bob.clone(), 10_000_000_000_000_000_000_000_000).build());
        contract.vote_on_proposal("vote_test_dao".to_string(), proposal_id.clone(), true).unwrap();

        // Verify proposal executed
        let proposal = contract.platform.storage_get(&format!("groups/vote_test_dao/proposals/{}", proposal_id)).unwrap();
        assert_eq!(proposal.get("status").unwrap().as_str().unwrap(), "executed");

        // Verify config was actually updated to new values
        let group_config = contract.get_group_config("vote_test_dao".to_string()).unwrap();
        let voting_config = group_config.get("voting_config").unwrap();
        assert_eq!(voting_config.get("participation_quorum_bps").unwrap().as_u64().unwrap(), 6600, "Participation quorum should be updated");
        assert_eq!(voting_config.get("majority_threshold_bps").unwrap().as_u64().unwrap(), 7500, "Majority threshold should be updated");
        let period = voting_config
            .get("voting_period")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())))
            .unwrap();
        assert_eq!(period, 1209600000000000u64, "Voting period should be updated");

        println!("✅ Multi-member voting correctly executes config change and persists new values");
    }

    #[test]
    fn test_config_change_metadata_tracking() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        // Create group
        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());
        let config = json!({"member_driven": true, "is_private": true});
        contract.create_group("metadata_dao".to_string(), config).unwrap();

        // Verify no metadata before any changes
        let group_config = contract.get_group_config("metadata_dao".to_string()).unwrap();
        assert!(group_config.get("voting_config_updated_at").is_none(), "Should have no update timestamp initially");
        assert!(group_config.get("voting_config_updated_by").is_none(), "Should have no updater initially");

        // Alice proposes and executes config change (single member = immediate execution)
        let mut context = get_context(alice.clone());
        // Use realistic timestamp: 1 hour after test base timestamp
        let test_timestamp = TEST_BASE_TIMESTAMP + 3_600_000_000_000; // +1 hour in nanoseconds
        context.block_timestamp(test_timestamp);
        testing_env!(context.build());
        
        let proposal_data = json!({"participation_quorum_bps": 4000});
        contract.create_group_proposal(
            "metadata_dao".to_string(),
            "voting_config_change".to_string(),
            proposal_data,
            None,
        ).unwrap();

        // Verify metadata was set
        let group_config = contract.get_group_config("metadata_dao".to_string()).unwrap();
        let updated_at = group_config
            .get("voting_config_updated_at")
            .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok())));
        assert_eq!(
            updated_at,
            Some(test_timestamp),
            "Should track update timestamp"
        );
        assert_eq!(
            group_config.get("voting_config_updated_by").and_then(|v| v.as_str()),
            Some(alice.as_str()),
            "Should track who made the update"
        );

        println!("✅ Config change metadata (timestamp and updater) correctly tracked");
    }
}
