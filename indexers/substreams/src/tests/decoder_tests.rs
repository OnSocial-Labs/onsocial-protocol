use crate::decoder::decode_onsocial_event;

#[test]
fn test_decode_nep297_event() {
    let json = r#"{
        "standard": "onsocial",
        "version": "1.0.0",
        "event": "GROUP_UPDATE",
        "data": [{
            "operation": "add_member",
            "author": "alice.near",
            "partition_id": 42,
            "group_id": "my_group",
            "member": "bob.near"
        }]
    }"#;

    let event = decode_onsocial_event(json).unwrap();

    assert_eq!(event.standard, "onsocial");
    assert_eq!(event.version, "1.0.0");
    assert_eq!(event.event, "GROUP_UPDATE");
    assert_eq!(event.data.len(), 1);

    let data = &event.data[0];
    assert_eq!(data.operation, "add_member");
    assert_eq!(data.author, "alice.near");
    assert_eq!(data.partition_id, Some(42));

    // Extra fields are captured
    assert_eq!(data.extra.get("group_id").unwrap(), "my_group");
    assert_eq!(data.extra.get("member").unwrap(), "bob.near");
}

#[test]
fn test_decode_event_no_partition() {
    let json = r#"{
        "standard": "onsocial",
        "version": "1.0.0",
        "event": "DATA_UPDATE",
        "data": [{
            "operation": "set",
            "author": "alice.near",
            "path": "alice.near/profile"
        }]
    }"#;

    let event = decode_onsocial_event(json).unwrap();

    assert_eq!(event.data[0].partition_id, None);
    assert_eq!(event.data[0].extra.get("path").unwrap(), "alice.near/profile");
}

#[test]
fn test_decode_event_multiple_data() {
    let json = r#"{
        "standard": "onsocial",
        "version": "1.0.0",
        "event": "BATCH_UPDATE",
        "data": [
            {"operation": "set", "author": "alice.near", "path": "a"},
            {"operation": "set", "author": "alice.near", "path": "b"}
        ]
    }"#;

    let event = decode_onsocial_event(json).unwrap();
    assert_eq!(event.data.len(), 2);
}

#[test]
fn test_decode_invalid_json() {
    let result = decode_onsocial_event("not json");
    assert!(result.is_err());
}

/// Generate test vectors for documentation
#[test]
fn generate_test_vectors() {
    let json = r#"{"standard":"onsocial","version":"1.0.0","event":"GROUP_UPDATE","data":[{"operation":"create_group","author":"alice.near","partition_id":42,"group_id":"my_group"}]}"#;

    println!("\n=== NEP-297 Test Vector (as emitted by contract) ===");
    println!("EVENT_JSON:{}", json);
    println!("\nThis is now standard JSON - parseable by any language!");
    println!("===========================================\n");
}
