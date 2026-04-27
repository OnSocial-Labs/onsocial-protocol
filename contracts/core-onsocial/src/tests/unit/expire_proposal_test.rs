// --- Expire Proposal Tests ---
// Permissionless `expire_proposal`: deadline gate, third-party caller,
// status transition, idempotency, and missing-proposal error.

#[cfg(test)]
mod expire_proposal_tests {
    use crate::constants::DEFAULT_VOTING_PERIOD;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::{AccountId, NearToken, testing_env};

    fn ctx_at(account: AccountId, deposit: u128, ts: u64) -> VMContextBuilder {
        let mut b = VMContextBuilder::new();
        b.current_account_id(accounts(0))
            .signer_account_id(account.clone())
            .predecessor_account_id(account)
            .block_timestamp(ts)
            .attached_deposit(NearToken::from_yoctonear(deposit));
        b
    }

    /// Bootstraps a member-driven group with two members and creates an active
    /// proposal. Returns (contract, proposal_id, owner, bob, third).
    fn setup_active_proposal() -> (crate::Contract, String, AccountId, AccountId, AccountId) {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let bob = accounts(1);
        let third = accounts(2);

        testing_env!(
            get_context_with_deposit(owner.clone(), test_deposits::legacy_10_near()).build()
        );
        contract
            .execute(create_group_request(
                "expg".to_string(),
                json!({"member_driven": true, "is_private": true}),
            ))
            .unwrap();

        // Two extra members so the proposer's vote alone (1/3 ≈ 33%) cannot
        // pass quorum and the proposal remains Active.
        test_add_member_bypass_proposals(&mut contract, "expg", &bob, 0, &owner);
        test_add_member_bypass_proposals(&mut contract, "expg", &third, 0, &owner);

        testing_env!(
            get_context_with_deposit(owner.clone(), test_deposits::proposal_creation()).build()
        );
        let proposal_id = contract
            .execute(create_proposal_request(
                "expg".to_string(),
                "custom_proposal".to_string(),
                json!({"title": "t", "description": "d", "custom_data": {}}),
                None,
            ))
            .unwrap()
            .as_str()
            .unwrap()
            .to_string();

        let stored = contract
            .platform
            .storage_get(&format!("groups/expg/proposals/{}", proposal_id))
            .expect("proposal must exist");
        assert_eq!(
            stored.get("status").and_then(|v| v.as_str()),
            Some("active")
        );

        (contract, proposal_id, owner, bob, third)
    }

    #[test]
    fn cannot_expire_before_voting_period_elapses() {
        let (mut contract, proposal_id, _owner, bob, _third) = setup_active_proposal();

        // Bob (a non-proposer) tries to expire one nanosecond before deadline.
        testing_env!(ctx_at(bob.clone(), 0, TEST_BASE_TIMESTAMP + DEFAULT_VOTING_PERIOD,).build());
        let res = contract.execute(expire_proposal_request("expg".to_string(), proposal_id));
        let err = res.expect_err("must fail before period elapses");
        assert!(matches!(err, crate::SocialError::InvalidInput(_)));
        assert!(
            err.to_string().contains("Voting period has not elapsed"),
            "unexpected error: {}",
            err
        );
    }

    #[test]
    fn anyone_can_expire_after_voting_period() {
        let (mut contract, proposal_id, _owner, _bob, third) = setup_active_proposal();

        // Third party (not proposer, not voter) calls one ns past deadline.
        testing_env!(
            ctx_at(
                third.clone(),
                0,
                TEST_BASE_TIMESTAMP + DEFAULT_VOTING_PERIOD + 1,
            )
            .build()
        );
        contract
            .execute(expire_proposal_request(
                "expg".to_string(),
                proposal_id.clone(),
            ))
            .expect("expire must succeed");

        let stored = contract
            .platform
            .storage_get(&format!("groups/expg/proposals/{}", proposal_id))
            .expect("proposal must still exist after expire");
        assert_eq!(
            stored.get("status").and_then(|v| v.as_str()),
            Some("expired")
        );
    }

    #[test]
    fn expire_is_not_idempotent_second_call_fails() {
        let (mut contract, proposal_id, _owner, _bob, third) = setup_active_proposal();

        testing_env!(
            ctx_at(
                third.clone(),
                0,
                TEST_BASE_TIMESTAMP + DEFAULT_VOTING_PERIOD + 1,
            )
            .build()
        );
        contract
            .execute(expire_proposal_request(
                "expg".to_string(),
                proposal_id.clone(),
            ))
            .expect("first expire must succeed");

        // Second call: status is now Expired, not Active.
        testing_env!(
            ctx_at(
                third.clone(),
                0,
                TEST_BASE_TIMESTAMP + DEFAULT_VOTING_PERIOD + 2,
            )
            .build()
        );
        let res = contract.execute(expire_proposal_request("expg".to_string(), proposal_id));
        let err = res.expect_err("second expire must fail");
        assert!(
            err.to_string()
                .contains("Only active proposals can be expired"),
            "unexpected error: {}",
            err
        );
    }

    #[test]
    fn expire_fails_when_proposal_missing() {
        let (mut contract, _pid, _owner, _bob, third) = setup_active_proposal();

        testing_env!(
            ctx_at(
                third.clone(),
                0,
                TEST_BASE_TIMESTAMP + DEFAULT_VOTING_PERIOD + 1,
            )
            .build()
        );
        let res = contract.execute(expire_proposal_request(
            "expg".to_string(),
            "does-not-exist".to_string(),
        ));
        let err = res.expect_err("missing proposal must error");
        assert!(
            err.to_string().contains("Proposal not found"),
            "unexpected error: {}",
            err
        );
    }
}
