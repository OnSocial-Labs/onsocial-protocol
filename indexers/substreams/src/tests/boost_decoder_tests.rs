use crate::boost_decoder::decode_boost_event;
use crate::pb::boost::v1::boost_event::Payload;

#[test]
fn test_decode_boost_lock() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"75000000000000000000","months":48,"effective_boost":"112500000000000000000","account_id":"alice.near"}]}"#;
    let event = decode_boost_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "BOOST_LOCK");
    assert_eq!(event.account_id, "alice.near");
    assert!(event.success);
    match event.payload.unwrap() {
        Payload::BoostLock(p) => {
            assert_eq!(p.amount, "75000000000000000000");
            assert_eq!(p.months, 48);
            assert_eq!(p.effective_boost, "112500000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_boost_extend() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_EXTEND","data":[{"new_months":12,"new_effective_boost":"200000000000000000000","account_id":"alice.near"}]}"#;
    let event = decode_boost_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "BOOST_EXTEND");
    match event.payload.unwrap() {
        Payload::BoostExtend(p) => {
            assert_eq!(p.new_months, 12);
            assert_eq!(p.new_effective_boost, "200000000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_boost_unlock() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_UNLOCK","data":[{"amount":"75000000000000000000","account_id":"alice.near"}]}"#;
    let event = decode_boost_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "BOOST_UNLOCK");
    match event.payload.unwrap() {
        Payload::BoostUnlock(p) => {
            assert_eq!(p.amount, "75000000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_credits_purchase() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CREDITS_PURCHASE","data":[{"amount":"100000000000000000000","infra_share":"60000000000000000000","rewards_share":"40000000000000000000","account_id":"buyer.near"}]}"#;
    let event = decode_boost_event(json, "receipt456", 200, 2000, 1).unwrap();
    assert_eq!(event.event_type, "CREDITS_PURCHASE");
    assert!(event.success);
    match event.payload.unwrap() {
        Payload::CreditsPurchase(p) => {
            assert_eq!(p.infra_share, "60000000000000000000");
            assert_eq!(p.rewards_share, "40000000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_unlock_failed() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNLOCK_FAILED","data":[{"amount":"50000000000000000000","account_id":"alice.near"}]}"#;
    let event = decode_boost_event(json, "receipt789", 300, 3000, 0).unwrap();
    assert_eq!(event.event_type, "UNLOCK_FAILED");
    assert!(!event.success);
}

#[test]
fn test_decode_rewards_released() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARDS_RELEASED","data":[{"amount":"4396703581071053","elapsed_ns":"1322741073698","total_released":"46857292777208385","remaining_pool":"1005153142707222791615","account_id":"boost.onsocial.testnet"}]}"#;
    let event = decode_boost_event(json, "receiptABC", 400, 4000, 0).unwrap();
    match event.payload.unwrap() {
        Payload::RewardsReleased(p) => {
            assert_eq!(p.amount, "4396703581071053");
            assert_eq!(p.remaining_pool, "1005153142707222791615");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_ignores_non_onsocial() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{}]}"#;
    assert!(decode_boost_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_captures_unknown_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNKNOWN_EVENT","data":[{"account_id":"a.near","foo":"bar"}]}"#;
    let event = decode_boost_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "UNKNOWN_EVENT");
    match &event.payload {
        Some(crate::pb::boost::v1::boost_event::Payload::UnknownEvent(p)) => {
            assert!(p.extra_data.contains("foo"));
            assert!(p.extra_data.contains("bar"));
        }
        _ => panic!("expected UnknownEvent payload"),
    }
}

#[test]
fn test_decode_malformed_json() {
    let json = r#"not valid json at all"#;
    assert!(decode_boost_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_empty_data_array() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[]}"#;
    assert!(decode_boost_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_missing_account_id_defaults_empty() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"1","months":6,"effective_boost":"1"}]}"#;
    let event = decode_boost_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.account_id, "");
}

#[test]
fn test_decode_event_id_format() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"BOOST_LOCK","data":[{"amount":"1","months":6,"effective_boost":"1","account_id":"a"}]}"#;
    let event = decode_boost_event(json, "receipt_ABC", 1, 1, 3).unwrap();
    assert_eq!(event.id, "receipt_ABC-3-BOOST_LOCK");
    assert_eq!(event.block_height, 1);
    assert_eq!(event.block_timestamp, 1);
    assert_eq!(event.receipt_id, "receipt_ABC");
}

#[test]
fn test_all_failure_events_have_success_false() {
    for event_type in &["UNLOCK_FAILED", "CLAIM_FAILED", "WITHDRAW_INFRA_FAILED"] {
        let json = format!(
            r#"{{"standard":"onsocial","version":"1.0.0","event":"{}","data":[{{"amount":"1","account_id":"a"}}]}}"#,
            event_type
        );
        let event = decode_boost_event(&json, "r", 1, 1, 0).unwrap();
        assert!(!event.success, "{} should have success=false", event_type);
    }
}

#[test]
fn test_decode_all_14_events() {
    let events = vec![
        (
            "BOOST_LOCK",
            r#"{"amount":"1","months":6,"effective_boost":"1","account_id":"a"}"#,
        ),
        (
            "BOOST_EXTEND",
            r#"{"new_months":12,"new_effective_boost":"1","account_id":"a"}"#,
        ),
        ("BOOST_UNLOCK", r#"{"amount":"1","account_id":"a"}"#),
        (
            "REWARDS_RELEASED",
            r#"{"amount":"1","elapsed_ns":"1","total_released":"1","remaining_pool":"1","account_id":"a"}"#,
        ),
        ("REWARDS_CLAIM", r#"{"amount":"1","account_id":"a"}"#),
        (
            "CREDITS_PURCHASE",
            r#"{"amount":"1","infra_share":"1","rewards_share":"1","account_id":"a"}"#,
        ),
        (
            "SCHEDULED_FUND",
            r#"{"amount":"1","total_pool":"1","account_id":"a"}"#,
        ),
        (
            "INFRA_WITHDRAW",
            r#"{"amount":"1","receiver_id":"b","account_id":"a"}"#,
        ),
        (
            "OWNER_CHANGED",
            r#"{"old_owner":"a","new_owner":"b","account_id":"a"}"#,
        ),
        (
            "CONTRACT_UPGRADE",
            r#"{"old_version":"0.1.0","new_version":"0.2.0","account_id":"a"}"#,
        ),
        (
            "STORAGE_DEPOSIT",
            r#"{"deposit":"5000000000000000000000","account_id":"a"}"#,
        ),
        ("UNLOCK_FAILED", r#"{"amount":"1","account_id":"a"}"#),
        ("CLAIM_FAILED", r#"{"amount":"1","account_id":"a"}"#),
        (
            "WITHDRAW_INFRA_FAILED",
            r#"{"amount":"1","account_id":"a"}"#,
        ),
    ];

    for (event_type, data_json) in events {
        let json = format!(
            r#"{{"standard":"onsocial","version":"1.0.0","event":"{}","data":[{}]}}"#,
            event_type, data_json
        );
        let event = decode_boost_event(&json, "r", 1, 1, 0);
        assert!(event.is_some(), "Failed to decode: {}", event_type);
        assert_eq!(event.unwrap().event_type, event_type);
    }
}
