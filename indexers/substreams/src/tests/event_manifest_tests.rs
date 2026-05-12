use crate::scarces_decoder::decode_scarces_event;
use serde_json::Value;

const EVENT_MANIFEST: &str = include_str!("../../tests/event_manifest.json");

#[test]
fn scarces_manifest_operations_decode() {
    let manifest: Value = serde_json::from_str(EVENT_MANIFEST).unwrap();
    let events = manifest["indexed_contracts"]["scarces"]["events"]
        .as_object()
        .unwrap();

    for (event_type, operations) in events {
        for operation in operations.as_array().unwrap() {
            let operation = operation.as_str().unwrap();
            let json = format!(
                r#"{{"standard":"onsocial","version":"1.0.0","event":"{}","data":[{{"operation":"{}","author":"alice.near"}}]}}"#,
                event_type, operation
            );
            let event = decode_scarces_event(&json, "receipt", 1, 1, 0)
                .unwrap_or_else(|| panic!("failed to decode {event_type}/{operation}"));
            assert_eq!(event.event_type, *event_type);
            assert_eq!(event.operation, operation);
        }
    }
}
