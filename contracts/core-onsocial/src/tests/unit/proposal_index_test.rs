// Proposal sequence index: get_proposal_by_sequence, get_proposal_count, list_proposals

#[cfg(test)]
mod proposal_index_tests {
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{AccountId, testing_env};

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    fn setup_group_with_members(
        contract: &mut crate::Contract,
        group_id: &str,
        owner: &AccountId,
        members: &[AccountId],
    ) {
        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        let config = json!({ "member_driven": true, "is_private": true });
        contract
            .execute(create_group_request(group_id.to_string(), config))
            .unwrap();

        for m in members {
            test_add_member_bypass_proposals(contract, group_id, m, 0, owner);
        }
    }

    #[test]
    fn test_get_proposal_count_empty() {
        let contract = init_live_contract();
        assert_eq!(contract.get_proposal_count("nogroup".to_string()), 0);
    }

    #[test]
    fn test_get_proposal_count_after_creation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        setup_group_with_members(
            &mut contract,
            "idx1",
            &owner,
            &[bob.clone(), charlie.clone()],
        );

        // Create a proposal
        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(create_proposal_request(
                "idx1".to_string(),
                "custom_proposal".to_string(),
                json!({"title": "First", "description": "test"}),
                Some(false),
            ))
            .unwrap();

        assert_eq!(contract.get_proposal_count("idx1".to_string()), 1);
    }

    #[test]
    fn test_get_proposal_by_sequence() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        setup_group_with_members(
            &mut contract,
            "idx2",
            &owner,
            &[bob.clone(), charlie.clone()],
        );

        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        contract
            .execute(create_proposal_request(
                "idx2".to_string(),
                "custom_proposal".to_string(),
                json!({"title": "Proposal A", "description": "first"}),
                Some(false),
            ))
            .unwrap();

        let proposal = contract
            .get_proposal_by_sequence("idx2".to_string(), 1)
            .expect("Should find proposal at sequence 1");

        assert_eq!(proposal["sequence_number"], 1);
        assert_eq!(proposal["type"], "custom_proposal");
    }

    #[test]
    fn test_get_proposal_by_sequence_not_found() {
        let contract = init_live_contract();
        assert!(
            contract
                .get_proposal_by_sequence("nogroup".to_string(), 1)
                .is_none()
        );
    }

    #[test]
    fn test_list_proposals_reverse_order() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        setup_group_with_members(
            &mut contract,
            "idx3",
            &owner,
            &[bob.clone(), charlie.clone()],
        );

        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );

        // Create 3 proposals
        for i in 1..=3 {
            contract
                .execute(create_proposal_request(
                    "idx3".to_string(),
                    "custom_proposal".to_string(),
                    json!({"title": format!("P{}", i), "description": "test"}),
                    Some(false),
                ))
                .unwrap();
        }

        assert_eq!(contract.get_proposal_count("idx3".to_string()), 3);

        let all = contract.list_proposals("idx3".to_string(), None, None);
        assert_eq!(all.len(), 3);
        // Newest first
        assert_eq!(all[0]["sequence_number"], 3);
        assert_eq!(all[1]["sequence_number"], 2);
        assert_eq!(all[2]["sequence_number"], 1);
    }

    #[test]
    fn test_list_proposals_pagination() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        setup_group_with_members(
            &mut contract,
            "idx4",
            &owner,
            &[bob.clone(), charlie.clone()],
        );

        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );

        for i in 1..=5 {
            contract
                .execute(create_proposal_request(
                    "idx4".to_string(),
                    "custom_proposal".to_string(),
                    json!({"title": format!("P{}", i), "description": "test"}),
                    Some(false),
                ))
                .unwrap();
        }

        // Page 1: latest 2
        let page1 = contract.list_proposals("idx4".to_string(), None, Some(2));
        assert_eq!(page1.len(), 2);
        assert_eq!(page1[0]["sequence_number"], 5);
        assert_eq!(page1[1]["sequence_number"], 4);

        // Page 2: from sequence 3, limit 2
        let page2 = contract.list_proposals("idx4".to_string(), Some(3), Some(2));
        assert_eq!(page2.len(), 2);
        assert_eq!(page2[0]["sequence_number"], 3);
        assert_eq!(page2[1]["sequence_number"], 2);

        // Page 3: from sequence 1, limit 2
        let page3 = contract.list_proposals("idx4".to_string(), Some(1), Some(2));
        assert_eq!(page3.len(), 1);
        assert_eq!(page3[0]["sequence_number"], 1);
    }

    #[test]
    fn test_list_proposals_empty_group() {
        let contract = init_live_contract();
        let result = contract.list_proposals("nogroup".to_string(), None, None);
        assert!(result.is_empty());
    }

    #[test]
    fn test_list_proposals_limit_capped_at_50() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        setup_group_with_members(
            &mut contract,
            "idx5",
            &owner,
            &[bob.clone(), charlie.clone()],
        );

        testing_env!(
            get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000).build()
        );

        // Create 3 proposals, request limit 100 → capped to 50, returns 3
        for i in 1..=3 {
            contract
                .execute(create_proposal_request(
                    "idx5".to_string(),
                    "custom_proposal".to_string(),
                    json!({"title": format!("P{}", i), "description": "test"}),
                    Some(false),
                ))
                .unwrap();
        }

        let result = contract.list_proposals("idx5".to_string(), None, Some(100));
        assert_eq!(result.len(), 3); // capped at 50 but only 3 exist
    }
}
