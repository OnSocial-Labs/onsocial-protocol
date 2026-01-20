#[cfg(test)]
mod tests {
    use near_sdk::serde_json::Value;

    use crate::errors::SocialError;

    #[test]
    fn parse_account_id_str_valid() {
        let id = crate::validation::parse_account_id_str(
            "alice.near",
            SocialError::InvalidInput("bad".to_string()),
        )
        .expect("must parse valid account id");
        assert_eq!(id.as_str(), "alice.near");
    }

    #[test]
    fn parse_account_id_str_invalid_returns_provided_error() {
        let err = crate::invalid_input!("Invalid account ID");
        let got = crate::validation::parse_account_id_str("not an account id", err.clone())
            .expect_err("must fail");

        match got {
            SocialError::InvalidInput(msg) => assert_eq!(msg, "Invalid account ID"),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn parse_account_id_value_accepts_string() {
        let v = Value::String("bob.near".to_string());
        let id =
            crate::validation::parse_account_id_value(&v, crate::invalid_input!("owner invalid"))
                .expect("must parse valid account id");
        assert_eq!(id.as_str(), "bob.near");
    }

    #[test]
    fn parse_account_id_value_rejects_non_string() {
        let v = Value::Null;
        let got =
            crate::validation::parse_account_id_value(&v, crate::invalid_input!("owner invalid"))
                .expect_err("must fail");

        match got {
            SocialError::InvalidInput(msg) => assert_eq!(msg, "owner invalid"),
            other => panic!("unexpected error: {other:?}"),
        }
    }

    #[test]
    fn parse_account_id_str_opt_is_none_on_invalid() {
        assert!(crate::validation::parse_account_id_str_opt("not an account id").is_none());
    }

    #[test]
    fn parse_account_id_str_opt_is_some_on_valid() {
        let id = crate::validation::parse_account_id_str_opt("carol.near").expect("should parse");
        assert_eq!(id.as_str(), "carol.near");
    }
}
