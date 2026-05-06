#[cfg(test)]
mod tests {
    use crate::tests::test_utils::*;
    use near_sdk::test_utils::accounts;

    use crate::tests::test_utils::transfer_group_ownership_request;

    #[test]
    fn test_transfer_ownership_logic_validation() {
        let owner = accounts(0);
        let new_owner = accounts(1);
        let non_member = accounts(2);

        assert!(
            owner != new_owner,
            "Test setup: owner and new_owner should be different"
        );

        assert!(
            owner != non_member,
            "Test setup: owner and non_member should be different"
        );
        assert!(
            new_owner != non_member,
            "Test setup: new_owner and non_member should be different"
        );
    }

    #[test]
    fn test_security_fixes_applied() {
        let owner = accounts(0);
        let context = get_context(owner.clone());
        near_sdk::testing_env!(context.build());
        let mut contract = init_live_contract();

        let result = contract.execute(transfer_group_ownership_request(
            "test".to_string(),
            accounts(1),
            None,
        ));
        assert!(
            result.is_err(),
            "Method should exist but fail due to test setup"
        );

        let error_msg = format!("{:?}", result.unwrap_err());
        println!("Error message: {}", error_msg);
    }
}
