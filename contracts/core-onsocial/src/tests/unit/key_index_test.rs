#[cfg(test)]
mod key_index_tests {
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::accounts;
    use near_sdk::{AccountId, testing_env};

    fn acct(i: usize) -> AccountId {
        accounts(i)
    }

    fn write(contract: &mut crate::Contract, who: &AccountId, key: &str, val: &str) {
        testing_env!(
            get_context_with_deposit(who.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        contract.execute(set_request(json!({ key: val }))).unwrap();
    }

    fn delete(contract: &mut crate::Contract, who: &AccountId, key: &str) {
        testing_env!(
            get_context_with_deposit(who.clone(), 10_000_000_000_000_000_000_000_000).build()
        );
        contract.execute(set_request(json!({ key: null }))).unwrap();
    }

    #[test]
    fn empty_prefix_returns_nothing() {
        let c = init_live_contract();
        assert!(c.list_keys("nope/".into(), None, None, None).is_empty());
        assert_eq!(c.count_keys("nope/".into()), 0);
    }

    #[test]
    fn write_indexes_key() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");

        let prefix = format!("{}/profile/", a);
        let keys = c.list_keys(prefix.clone(), None, None, None);
        assert_eq!(keys.len(), 1);
        assert_eq!(keys[0].key, format!("{}/profile/name", a));
        assert_eq!(c.count_keys(prefix), 1);
    }

    #[test]
    fn multiple_keys_same_prefix() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &a, "profile/bio", "Dev");
        write(&mut c, &a, "profile/website", "https://a.dev");

        let prefix = format!("{}/profile/", a);
        assert_eq!(c.count_keys(prefix.clone()), 3);

        let keys = c.list_keys(prefix, None, None, None);
        assert_eq!(keys.len(), 3);
        // Lexicographic order
        assert!(keys[0].key.ends_with("/profile/bio"));
        assert!(keys[1].key.ends_with("/profile/name"));
        assert!(keys[2].key.ends_with("/profile/website"));
    }

    #[test]
    fn delete_removes_from_index() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &a, "profile/bio", "Dev");

        let prefix = format!("{}/profile/", a);
        assert_eq!(c.count_keys(prefix.clone()), 2);

        delete(&mut c, &a, "profile/name");
        assert_eq!(c.count_keys(prefix.clone()), 1);

        let keys = c.list_keys(prefix, None, None, None);
        assert_eq!(keys.len(), 1);
        assert!(keys[0].key.ends_with("/profile/bio"));
    }

    #[test]
    fn prefixes_are_isolated() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &a, "settings/theme", "dark");

        assert_eq!(c.count_keys(format!("{}/profile/", a)), 1);
        assert_eq!(c.count_keys(format!("{}/settings/", a)), 1);
    }

    #[test]
    fn accounts_are_isolated() {
        let mut c = init_live_contract();
        let a = acct(0);
        let b = acct(1);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &b, "profile/name", "Bob");

        assert_eq!(c.count_keys(format!("{}/profile/", a)), 1);
        assert_eq!(c.count_keys(format!("{}/profile/", b)), 1);
    }

    #[test]
    fn pagination_with_cursor() {
        let mut c = init_live_contract();
        let a = acct(0);
        for i in 0..5 {
            write(&mut c, &a, &format!("data/item_{}", i), &format!("v{}", i));
        }

        let prefix = format!("{}/data/", a);
        let p1 = c.list_keys(prefix.clone(), None, Some(2), None);
        assert_eq!(p1.len(), 2);

        let cursor = p1.last().unwrap().key.clone();
        let p2 = c.list_keys(prefix.clone(), Some(cursor.clone()), Some(2), None);
        assert_eq!(p2.len(), 2);
        assert_ne!(p2[0].key, cursor);

        let cursor2 = p2.last().unwrap().key.clone();
        let p3 = c.list_keys(prefix, Some(cursor2), Some(2), None);
        assert_eq!(p3.len(), 1);
    }

    #[test]
    fn limit_capped_at_50() {
        let mut c = init_live_contract();
        let a = acct(0);
        for i in 0..55 {
            write(&mut c, &a, &format!("bulk/k{:03}", i), &format!("v{}", i));
        }

        let prefix = format!("{}/bulk/", a);
        let keys = c.list_keys(prefix.clone(), None, Some(100), None);
        assert_eq!(keys.len(), 50);
        assert_eq!(c.count_keys(prefix), 55);
    }

    #[test]
    fn update_does_not_duplicate() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "v1");
        write(&mut c, &a, "profile/name", "v2");

        assert_eq!(c.count_keys(format!("{}/profile/", a)), 1);
    }

    #[test]
    fn broad_account_prefix() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &a, "settings/theme", "dark");
        write(&mut c, &a, "data/notes", "hi");

        let prefix = format!("{}/", a);
        assert_eq!(c.count_keys(prefix.clone()), 3);
        assert_eq!(c.list_keys(prefix, None, None, None).len(), 3);
    }

    #[test]
    fn list_keys_without_values_omits_value_field() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");

        let prefix = format!("{}/profile/", a);
        let keys = c.list_keys(prefix, None, None, None);
        assert_eq!(keys.len(), 1);
        assert!(keys[0].value.is_none());
    }

    #[test]
    fn list_keys_with_values_returns_stored_data() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");
        write(&mut c, &a, "profile/bio", "Developer");

        let prefix = format!("{}/profile/", a);
        let keys = c.list_keys(prefix, None, None, Some(true));
        assert_eq!(keys.len(), 2);
        // Lex order: bio, name
        assert_eq!(
            keys[0].value,
            Some(near_sdk::serde_json::json!("Developer"))
        );
        assert_eq!(keys[1].value, Some(near_sdk::serde_json::json!("Alice")));
    }

    #[test]
    fn with_values_false_same_as_none() {
        let mut c = init_live_contract();
        let a = acct(0);
        write(&mut c, &a, "profile/name", "Alice");

        let prefix = format!("{}/profile/", a);
        let keys = c.list_keys(prefix, None, None, Some(false));
        assert_eq!(keys.len(), 1);
        assert!(keys[0].value.is_none());
    }
}
