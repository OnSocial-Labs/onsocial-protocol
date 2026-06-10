use crate::social_spend_decoder::decode_social_spend_event;

#[test]
fn decode_social_spent_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SOCIAL_SPENT","data":[{"spender_id":"alice.near","amount":"1000000000000000000","app_id":"portal","action":"join_rally","target_type":"rally","target_id":"season0","treasury_amount":"100000000000000000","season_amount":"900000000000000000","target_amount":"0","season_id":"season0","tag":"first-spend","metadata":{"source":"test"},"account_id":"alice.near"}]}"#;
    let event = decode_social_spend_event(json, "receipt123", 100, 1000, 0).unwrap();
    assert_eq!(event.event_type, "SOCIAL_SPENT");
    assert_eq!(event.account_id, "alice.near");
    assert_eq!(event.spender_id, "alice.near");
    assert_eq!(event.action, "join_rally");
    assert_eq!(event.season_id, "season0");
    assert_eq!(event.season_amount, "900000000000000000");
    assert!(event.metadata.contains("source"));
    assert!(event.success);
}

#[test]
fn decode_season_pool_funded_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SEASON_POOL_FUNDED","data":[{"season_id":"season0","amount":"50000000000000000000000000","source":"treasury","tag":"treasury","pool_total":"50000000000000000000000000","account_id":"dao.onsocial.near"}]}"#;
    let event = decode_social_spend_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "SEASON_POOL_FUNDED");
    assert_eq!(event.season_id, "season0");
    assert_eq!(event.amount, "50000000000000000000000000");
    assert_eq!(event.tag, "treasury");
}

#[test]
fn decode_season_root_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SEASON_ROOT_PUBLISHED","data":[{"season_id":"season0","root":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","total_amount":"42","active":true,"account_id":"relayer.onsocial.testnet"}]}"#;
    let event = decode_social_spend_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "SEASON_ROOT_PUBLISHED");
    assert_eq!(event.account_id, "relayer.onsocial.testnet");
    assert_eq!(event.season_id, "season0");
    assert_eq!(event.root, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=");
    assert_eq!(event.total_amount, "42");
    assert!(event.active);
}

#[test]
fn decode_season_config_event() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SEASON_CONFIG_SET","data":[{"season_id":"season0","label":"Support Rally","active":true,"starts_at_ns":1779271678996371500,"ends_at_ns":1781863738996371500,"claim_starts_at_ns":1781863738996371500,"account_id":"onsocial.testnet"}]}"#;
    let event = decode_social_spend_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.label, "Support Rally");
    assert_eq!(event.starts_at_ns, 1779271678996371500);
    assert_eq!(event.claim_starts_at_ns, 1781863738996371500);
}

#[test]
fn decode_failed_transfer_marks_success_false() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"SOCIAL_TRANSFER_FAILED","data":[{"amount":"100","account_id":"alice.near"}]}"#;
    let event = decode_social_spend_event(json, "r", 1, 1, 0).unwrap();
    assert_eq!(event.event_type, "SOCIAL_TRANSFER_FAILED");
    assert!(!event.success);
    assert_eq!(event.amount, "100");
}

#[test]
fn ignores_non_onsocial() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{}]}"#;
    assert!(decode_social_spend_event(json, "r", 1, 1, 0).is_none());
}

#[test]
fn skips_malformed_json() {
    assert!(decode_social_spend_event("not json", "r", 1, 1, 0).is_none());
}
