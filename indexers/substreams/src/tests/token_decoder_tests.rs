use crate::token_decoder::decode_token_events;
use crate::pb::token::v1::token_event::Payload;

#[test]
fn test_decode_ft_mint() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"alice.near","amount":"1000000000000000000000000000","memo":"Initial mint"}]}"#;
    let events = decode_token_events(json, "receipt123", 100, 1000, 0);
    assert_eq!(events.len(), 1);
    let event = &events[0];
    assert_eq!(event.event_type, "ft_mint");
    match event.payload.as_ref().unwrap() {
        Payload::FtMint(p) => {
            assert_eq!(p.owner_id, "alice.near");
            assert_eq!(p.amount, "1000000000000000000000000000");
            assert_eq!(p.memo, "Initial mint");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_ft_burn() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_burn","data":[{"owner_id":"bob.near","amount":"500000000000000000","memo":"User burn"}]}"#;
    let events = decode_token_events(json, "receipt456", 200, 2000, 1);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "ft_burn");
    match events[0].payload.as_ref().unwrap() {
        Payload::FtBurn(p) => {
            assert_eq!(p.owner_id, "bob.near");
            assert_eq!(p.amount, "500000000000000000");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_ft_transfer() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"alice.near","new_owner_id":"bob.near","amount":"100000000000000000000","memo":"payment"}]}"#;
    let events = decode_token_events(json, "receipt789", 300, 3000, 0);
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].event_type, "ft_transfer");
    match events[0].payload.as_ref().unwrap() {
        Payload::FtTransfer(p) => {
            assert_eq!(p.old_owner_id, "alice.near");
            assert_eq!(p.new_owner_id, "bob.near");
            assert_eq!(p.amount, "100000000000000000000");
            assert_eq!(p.memo, "payment");
        }
        _ => panic!("wrong payload"),
    }
}

#[test]
fn test_decode_batch_transfer() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_transfer","data":[{"old_owner_id":"alice.near","new_owner_id":"bob.near","amount":"100","memo":""},{"old_owner_id":"alice.near","new_owner_id":"carol.near","amount":"200","memo":""}]}"#;
    let events = decode_token_events(json, "receiptBatch", 400, 4000, 0);
    assert_eq!(events.len(), 2);
    assert_eq!(events[0].id, "receiptBatch-0-0-token");
    assert_eq!(events[1].id, "receiptBatch-0-1-token");
}

#[test]
fn test_decode_ignores_onsocial_standard() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"DATA_UPDATE","data":[{}]}"#;
    let events = decode_token_events(json, "r", 1, 1, 0);
    assert!(events.is_empty());
}

#[test]
fn test_decode_ignores_unknown_event() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_unknown","data":[{"owner_id":"x"}]}"#;
    let events = decode_token_events(json, "r", 1, 1, 0);
    assert!(events.is_empty());
}

#[test]
fn test_decode_handles_invalid_json() {
    let events = decode_token_events("not json", "r", 1, 1, 0);
    assert!(events.is_empty());
}

#[test]
fn test_decode_handles_empty_data() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[]}"#;
    let events = decode_token_events(json, "r", 1, 1, 0);
    assert!(events.is_empty());
}

#[test]
fn test_event_id_format() {
    let json = r#"{"standard":"nep141","version":"1.0.0","event":"ft_mint","data":[{"owner_id":"a","amount":"1","memo":""}]}"#;
    let events = decode_token_events(json, "RECEIPT_ABC", 100, 1000, 3);
    assert_eq!(events[0].id, "RECEIPT_ABC-3-0-token");
}
