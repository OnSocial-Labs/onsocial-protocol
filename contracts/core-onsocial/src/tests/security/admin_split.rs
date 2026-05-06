//! Tests for the `execute()` versus `execute_admin()` split.

#[cfg(test)]
mod admin_split_tests {
    use crate::tests::test_utils::*;
    use crate::{Action, Options, PublicKey, Request, SocialError};
    use near_sdk::json_types::U64;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::{VMContextBuilder, accounts};
    use near_sdk::{AccountId, NearToken, testing_env};
    use std::str::FromStr;

    fn ctx(predecessor: &AccountId) {
        let context = VMContextBuilder::new()
            .signer_account_id(predecessor.clone())
            .predecessor_account_id(predecessor.clone())
            .attached_deposit(NearToken::from_near(1))
            .block_timestamp(TEST_BASE_TIMESTAMP)
            .is_view(false)
            .build();
        testing_env!(context);
    }

    fn alice() -> AccountId {
        accounts(0)
    }

    fn admin_data_request(key: &str) -> Request {
        Request {
            target_account: Some(alice()),
            action: Action::Set {
                data: json!({ key: "1" }),
            },
            options: Some(Options::default()),
        }
    }

    #[test]
    fn execute_rejects_set_permission() {
        let mut contract = init_live_contract();
        ctx(&alice());
        let req = Request {
            target_account: Some(alice()),
            action: Action::SetPermission {
                grantee: accounts(1),
                path: "alice/posts".into(),
                level: 1,
                expires_at: None,
            },
            options: Some(Options::default()),
        };
        let err = contract
            .execute(req)
            .expect_err("set_permission must be admin-only");
        assert!(matches!(err, SocialError::PermissionDenied(_, _)),);
    }

    #[test]
    fn execute_rejects_set_key_permission() {
        let mut contract = init_live_contract();
        ctx(&alice());
        let pk = PublicKey::from_str("ed25519:DcA2MzgpJbrUATQLLceocVckhhAqrkingax4oJ9kZ847")
            .expect("valid pk");
        let req = Request {
            target_account: Some(alice()),
            action: Action::SetKeyPermission {
                public_key: pk,
                path: "alice/posts".into(),
                level: 1,
                expires_at: Some(U64(0)),
            },
            options: Some(Options::default()),
        };
        let err = contract
            .execute(req)
            .expect_err("set_key_permission must be admin-only");
        assert!(matches!(err, SocialError::PermissionDenied(_, _)));
    }

    #[test]
    fn execute_rejects_set_with_storage_keys() {
        let mut contract = init_live_contract();
        ctx(&alice());
        for key in [
            "storage/deposit",
            "storage/withdraw",
            "storage/share_storage",
            "storage/return_shared_storage",
            "storage/tip",
            "storage/shared_pool_deposit",
            "storage/platform_pool_deposit",
            "storage/group_pool_deposit",
        ] {
            let err = contract
                .execute(admin_data_request(key))
                .err()
                .unwrap_or_else(|| panic!("expected admin rejection for {key}"));
            assert!(
                matches!(err, SocialError::PermissionDenied(_, _)),
                "key={key} got={err:?}"
            );
        }
    }

    #[test]
    fn execute_rejects_set_with_permission_keys() {
        let mut contract = init_live_contract();
        ctx(&alice());
        for key in ["permission/grant", "permission/revoke"] {
            let err = contract
                .execute(admin_data_request(key))
                .err()
                .unwrap_or_else(|| panic!("expected admin rejection for {key}"));
            assert!(
                matches!(err, SocialError::PermissionDenied(_, _)),
                "key={key} got={err:?}"
            );
        }
    }

    #[test]
    fn execute_accepts_plain_data_writes() {
        let mut contract = init_live_contract();
        ctx(&alice());
        // Sanity: non-admin Set payload still flows through `execute`.
        contract
            .execute(set_request(json!({ "profile/bio": "hello" })))
            .expect("plain data writes must succeed via execute()");
    }

    #[test]
    fn execute_admin_accepts_set_permission() {
        let mut contract = init_live_contract();
        ctx(&alice());
        let req = Request {
            target_account: Some(alice()),
            action: Action::SetPermission {
                grantee: accounts(1),
                path: "alice/posts".into(),
                level: 1,
                expires_at: None,
            },
            options: Some(Options::default()),
        };
        contract
            .execute_admin(req)
            .expect("execute_admin must accept set_permission");
    }
}
