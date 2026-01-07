// --- Governance Status Tests ---
// Unit tests that exercise ProposalStatus parsing via end-to-end governance call paths.
//
// Note: ProposalStatus is `pub(super)` in the governance module, so these tests validate
// the behavior indirectly by corrupting stored proposal JSON and invoking vote/cancel.

#[cfg(test)]
mod governance_status_tests {
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::{json, Value};
    use near_sdk::test_utils::accounts;
    use near_sdk::{testing_env, AccountId};

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    #[test]
    fn test_vote_fails_when_proposal_status_missing() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);

        // Create member-driven group.
        testing_env!(get_context_with_deposit(owner.clone(), test_deposits::legacy_10_near()).build());
        contract
            .create_group(
                "status_missing".to_string(),
                json!({"member_driven": true, "is_private": true}),
            )
            .unwrap();

        // Add a member so proposals remain active (1/2 = 50% < 51% quorum).
        test_add_member_bypass_proposals(&mut contract, "status_missing", &bob, 0, &owner);

        // Create a proposal (should be active).
        testing_env!(get_context_with_deposit(owner.clone(), test_deposits::proposal_creation()).build());
        let proposal_id = contract
            .create_group_proposal(
                "status_missing".to_string(),
                "custom_proposal".to_string(),
                json!({"title": "t", "description": "d", "custom_data": {}}),
                None,
            )
            .unwrap();

        let proposal_key = format!("groups/status_missing/proposals/{}", proposal_id);
        let mut proposal = contract
            .platform
            .storage_get(&proposal_key)
            .expect("proposal must exist");

        // Sanity: status written using ProposalStatus::Active.as_str().
        assert_eq!(proposal.get("status").and_then(|v| v.as_str()), Some("active"));

        // Corrupt storage: remove status field.
        if let Some(obj) = proposal.as_object_mut() {
            obj.remove("status");
        } else {
            panic!("proposal must be an object");
        }
        contract
            .platform
            .storage_set(&proposal_key, &proposal)
            .expect("test setup: failed to write corrupted proposal");

        // Voting should now fail at ProposalStatus::from_json_status(None).
        testing_env!(get_context_with_deposit(bob.clone(), test_deposits::proposal_creation()).build());
        let res = contract.vote_on_proposal(
            "status_missing".to_string(),
            proposal_id.clone(),
            true,
        );

        let err = res.expect_err("vote must fail when status is missing");
        assert!(matches!(err, crate::SocialError::InvalidInput(_)));
        assert!(err.to_string().contains("missing status"));
    }

    #[test]
    fn test_cancel_fails_when_proposal_status_invalid_string() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);

        // Create member-driven group.
        testing_env!(get_context_with_deposit(owner.clone(), test_deposits::legacy_10_near()).build());
        contract
            .create_group(
                "status_invalid".to_string(),
                json!({"member_driven": true, "is_private": true}),
            )
            .unwrap();

        // Add a member so proposals remain active.
        test_add_member_bypass_proposals(&mut contract, "status_invalid", &bob, 0, &owner);

        // Create a proposal (should be active).
        testing_env!(get_context_with_deposit(owner.clone(), test_deposits::proposal_creation()).build());
        let proposal_id = contract
            .create_group_proposal(
                "status_invalid".to_string(),
                "custom_proposal".to_string(),
                json!({"title": "t", "description": "d", "custom_data": {}}),
                None,
            )
            .unwrap();

        let proposal_key = format!("groups/status_invalid/proposals/{}", proposal_id);
        let mut proposal = contract
            .platform
            .storage_get(&proposal_key)
            .expect("proposal must exist");

        // Corrupt storage: set status to an invalid string.
        if let Some(obj) = proposal.as_object_mut() {
            obj.insert("status".to_string(), Value::String("bogus".to_string()));
        } else {
            panic!("proposal must be an object");
        }
        contract
            .platform
            .storage_set(&proposal_key, &proposal)
            .expect("test setup: failed to write corrupted proposal");

        // Cancel should fail at ProposalStatus::parse("bogus") -> None.
        testing_env!(get_context_with_deposit(owner.clone(), test_deposits::proposal_creation()).build());
        let res = contract.cancel_proposal("status_invalid".to_string(), proposal_id);

        let err = res.expect_err("cancel must fail when status is invalid");
        assert!(matches!(err, crate::SocialError::InvalidInput(_)));
        assert!(err.to_string().contains("Invalid proposal status"));
    }
}
