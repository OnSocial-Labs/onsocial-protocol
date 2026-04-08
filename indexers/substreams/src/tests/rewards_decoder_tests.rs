use crate::pb::rewards::v1::rewards_event::Payload;
use crate::rewards_decoder::decode_rewards_event;

#[test]
fn test_decode_reward_credited() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"1000000000000000000","source":"boost","credited_by":"executor.near","app_id":"portal","account_id":"alice.near"}]}"#;
    let event = decode_rewards_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "REWARD_CREDITED");
    assert_eq!(event.account_id, "alice.near");
    assert!(event.success);
    match event.payload.unwrap() {
        Payload::RewardCredited(p) => {
            assert_eq!(p.amount, "1000000000000000000");
            assert_eq!(p.source, "boost");
            assert_eq!(p.credited_by, "executor.near");
            assert_eq!(p.app_id, "portal");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_reward_claimed() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CLAIMED","data":[{"amount":"5000000000000000000","account_id":"alice.near"}]}"#;
    let event = decode_rewards_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "REWARD_CLAIMED");
    assert!(event.success);
    match event.payload.unwrap() {
        Payload::RewardClaimed(p) => {
            assert_eq!(p.amount, "5000000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_claim_failed() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CLAIM_FAILED","data":[{"amount":"100","account_id":"alice.near"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "CLAIM_FAILED");
    assert!(!event.success);
}

#[test]
fn test_decode_pool_deposit() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"POOL_DEPOSIT","data":[{"amount":"10000","new_balance":"50000","account_id":"owner.near"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    match event.payload.unwrap() {
        Payload::PoolDeposit(p) => {
            assert_eq!(p.amount, "10000");
            assert_eq!(p.new_balance, "50000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_owner_changed() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"OWNER_CHANGED","data":[{"old_owner":"old.near","new_owner":"new.near","account_id":"old.near"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    match event.payload.unwrap() {
        Payload::OwnerChanged(p) => {
            assert_eq!(p.old_owner, "old.near");
            assert_eq!(p.new_owner, "new.near");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_max_daily_updated() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"MAX_DAILY_UPDATED","data":[{"old_max":"1000","new_max":"2000","account_id":"owner.near"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    match event.payload.unwrap() {
        Payload::MaxDailyUpdated(p) => {
            assert_eq!(p.old_max, "1000");
            assert_eq!(p.new_max, "2000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_executor_added() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"EXECUTOR_ADDED","data":[{"executor":"bot.near","account_id":"owner.near"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    match event.payload.unwrap() {
        Payload::ExecutorAdded(p) => {
            assert_eq!(p.executor, "bot.near");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_contract_upgrade() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"CONTRACT_UPGRADE","data":[{"old_version":"1.0.0","new_version":"2.0.0","account_id":"rewards.onsocial.testnet"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    match event.payload.unwrap() {
        Payload::ContractUpgrade(p) => {
            assert_eq!(p.old_version, "1.0.0");
            assert_eq!(p.new_version, "2.0.0");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_ignores_non_onsocial() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{}]}"#;
    assert!(decode_rewards_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_captures_unknown_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"UNKNOWN_EVENT","data":[{"account_id":"a.near","foo":"bar"}]}"#;
    let event = decode_rewards_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "UNKNOWN_EVENT");
    match &event.payload {
        Some(crate::pb::rewards::v1::rewards_event::Payload::UnknownEvent(p)) => {
            assert!(p.extra_data.contains("foo"));
            assert!(p.extra_data.contains("bar"));
        }
        _ => panic!("expected UnknownEvent payload"),
    }
}

#[test]
fn test_decode_malformed_json() {
    let json = r#"not valid json at all"#;
    assert!(decode_rewards_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_empty_data_array() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[]}"#;
    assert!(decode_rewards_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn test_decode_event_id_format() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"REWARD_CREDITED","data":[{"amount":"1","source":"boost","credited_by":"e","app_id":"p","account_id":"a"}]}"#;
    let event = decode_rewards_event(json, "receipt_ABC", 1, 1, 3).unwrap();
    assert_eq!(event.id, "receipt_ABC-3-REWARD_CREDITED");
    assert_eq!(event.block_height, 1);
    assert_eq!(event.receipt_id, "receipt_ABC");
}

#[test]
fn test_decode_all_11_events() {
    let events = vec![
        (
            "REWARD_CREDITED",
            r#"{"amount":"1","source":"boost","credited_by":"e","app_id":"p","account_id":"a"}"#,
        ),
        ("REWARD_CLAIMED", r#"{"amount":"1","account_id":"a"}"#),
        ("CLAIM_FAILED", r#"{"amount":"1","account_id":"a"}"#),
        (
            "POOL_DEPOSIT",
            r#"{"amount":"1","new_balance":"1","account_id":"a"}"#,
        ),
        (
            "OWNER_CHANGED",
            r#"{"old_owner":"a","new_owner":"b","account_id":"a"}"#,
        ),
        (
            "MAX_DAILY_UPDATED",
            r#"{"old_max":"1","new_max":"2","account_id":"a"}"#,
        ),
        ("EXECUTOR_ADDED", r#"{"executor":"e","account_id":"a"}"#),
        ("EXECUTOR_REMOVED", r#"{"executor":"e","account_id":"a"}"#),
        ("CALLER_ADDED", r#"{"caller":"c","account_id":"a"}"#),
        ("CALLER_REMOVED", r#"{"caller":"c","account_id":"a"}"#),
        (
            "CONTRACT_UPGRADE",
            r#"{"old_version":"1.0.0","new_version":"2.0.0","account_id":"a"}"#,
        ),
    ];

    for (event_type, data_json) in events {
        let json = format!(
            r#"{{"standard":"onsocial","version":"1.0.0","event":"{}","data":[{}]}}"#,
            event_type, data_json
        );
        let event = decode_rewards_event(&json, "r", 1, 1, 0);
        assert!(event.is_some(), "Failed to decode: {}", event_type);
        assert_eq!(event.unwrap().event_type, event_type);
    }
}
