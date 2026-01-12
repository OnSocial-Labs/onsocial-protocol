// --- EventBuilder writes[] Tests ---
// Validates canonical merge/dedup/ordering behavior for replay writes.

#[cfg(test)]
mod event_builder_writes_tests {
    use crate::events::{EventBatch, EventBuilder};
    use crate::events::types::Event;
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::{self, json, Value};
    use near_sdk::test_utils::{accounts, get_logs};
    use near_sdk::{testing_env, AccountId};

    const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

    fn decode_event(log: &str) -> Option<Event> {
        if !log.starts_with(EVENT_JSON_PREFIX) {
            return None;
        }
        let json_data = &log[EVENT_JSON_PREFIX.len()..];
        serde_json::from_str(json_data).ok()
    }

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }

    #[test]
    fn writes_merge_dedup_and_order_are_canonical() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let path = format!("{}/foo", alice);

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path(&path)
            // Pre-existing writes field (e.g. from structured_data / manual field usage)
            .with_field(
                "writes",
                json!([
                    {"path": "state/a", "value": 1},
                    {"path": "state/z", "value": "keep"}
                ]),
            )
            // Builder writes should override on path collision
            .with_write("state/a", 2)
            .with_write("state/b", json!({"nested": true}))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected at least one EVENT_JSON log");

        let event = decode_event(event_log).expect("Expected decodable NEP-297 event");
        let data0 = event.data.first().expect("Event must have at least one data entry");

        let writes = data0
            .extra
            .get("writes")
            .expect("writes field should exist")
            .as_array()
            .expect("writes must be an array");

        // Deterministic ordering by path (BTreeMap)
        let paths: Vec<_> = writes
            .iter()
            .map(|w| w.get("path").and_then(|v| v.as_str()).unwrap().to_string())
            .collect();
        assert_eq!(paths, vec!["state/a", "state/b", "state/z"]);

        let write_map: std::collections::HashMap<String, Value> = writes
            .iter()
            .map(|w| {
                (
                    w.get("path").and_then(|v| v.as_str()).unwrap().to_string(),
                    w.get("value").cloned().unwrap(),
                )
            })
            .collect();

        assert_eq!(write_map.get("state/a").unwrap(), &json!(2));
        assert_eq!(write_map.get("state/b").unwrap(), &json!({"nested": true}));
        assert_eq!(write_map.get("state/z").unwrap(), &json!("keep"));
    }

    #[test]
    fn structured_data_writes_cannot_override_builder_writes() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path(&format!("{}/bar", alice))
            .with_structured_data(json!({
                "writes": [
                    {"path": "state/x", "value": "bad"}
                ]
            }))
            .with_write("state/x", "good")
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected at least one EVENT_JSON log");

        let event = decode_event(event_log).expect("Expected decodable NEP-297 event");
        let data0 = event.data.first().expect("Event must have at least one data entry");

        let writes = data0
            .extra
            .get("writes")
            .expect("writes field should exist")
            .as_array()
            .expect("writes must be an array");

        let x = writes
            .iter()
            .find(|w| w.get("path").and_then(|v| v.as_str()) == Some("state/x"))
            .expect("state/x write should exist");

        assert_eq!(x.get("value").unwrap(), &json!("good"));
    }

    #[test]
    fn structured_data_cannot_override_builder_core_fields() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path("alice/real_path")
            .with_target(&alice)
            .with_value(json!("real_value"))
            .with_field("custom_field", "real_custom")
            // Attempt to spoof core fields via structured_data
            .with_structured_data(json!({
                "path": "spoofed/path",
                "target_id": "attacker.near",
                "value": "spoofed_value",
                "custom_field": "spoofed_custom"
            }))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        // Builder fields must take precedence
        assert_eq!(
            data0.extra.get("path").and_then(|v| v.as_str()),
            Some("alice/real_path"),
            "path must not be overridden by structured_data"
        );
        assert_eq!(
            data0.extra.get("target_id").and_then(|v| v.as_str()),
            Some(alice.as_str()),
            "target_id must not be overridden by structured_data"
        );
        assert_eq!(
            data0.extra.get("value").and_then(|v| v.as_str()),
            Some("real_value"),
            "value must not be overridden by structured_data"
        );
        assert_eq!(
            data0.extra.get("custom_field").and_then(|v| v.as_str()),
            Some("real_custom"),
            "custom_field must not be overridden by structured_data"
        );
    }

    #[test]
    fn non_object_structured_data_stored_under_key() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path("alice/test")
            .with_structured_data(json!("plain_string"))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        // Non-object should be stored under "structured_data" key
        assert_eq!(
            data0.extra.get("structured_data").and_then(|v| v.as_str()),
            Some("plain_string"),
            "Non-object structured_data must be stored under 'structured_data' key"
        );
    }

    #[test]
    fn no_writes_field_when_empty() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path("alice/no_writes")
            .with_value(json!("test"))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        // No writes[] field should exist when no writes were added
        assert!(
            data0.extra.get("writes").is_none(),
            "writes field must not exist when no writes added"
        );
    }

    #[test]
    fn with_field_overwrites_on_duplicate_key() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path("alice/test")
            .with_field("dup_key", "first")
            .with_field("dup_key", "second")
            .with_field("dup_key", "final")
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        assert_eq!(
            data0.extra.get("dup_key").and_then(|v| v.as_str()),
            Some("final"),
            "Later with_field calls must overwrite earlier ones"
        );
    }

    #[test]
    fn event_includes_partition_id() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path(&format!("{}/test", alice))
            .with_value(json!("v"))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        assert!(
            data0.partition_id.is_some(),
            "Event must include partition_id for data locality"
        );
    }

    #[test]
    fn multiple_structured_data_calls_preserve_first_values() {
        let alice = test_account(0);
        testing_env!(get_context(alice.clone()).build());
        let _ = get_logs();

        let mut batch = EventBatch::new();
        EventBuilder::new("DATA_UPDATE", "set", alice.clone())
            .with_path("alice/test")
            .with_structured_data(json!({
                "field_a": "first",
                "field_b": 100
            }))
            // Second call should NOT override field_a, but should add field_c
            .with_structured_data(json!({
                "field_a": "second_attempt",
                "field_c": "new_field"
            }))
            .emit(&mut batch);

        batch.emit().unwrap();

        let logs = get_logs();
        let event_log = logs
            .iter()
            .find(|l| l.starts_with(EVENT_JSON_PREFIX))
            .expect("Expected EVENT_JSON log");

        let event = decode_event(event_log).expect("Event should decode");
        let data0 = event.data.first().expect("Event should have data");

        // First structured_data call wins for field_a
        assert_eq!(
            data0.extra.get("field_a").and_then(|v| v.as_str()),
            Some("first"),
            "First structured_data value must be preserved"
        );

        // field_b from first call preserved
        assert_eq!(
            data0.extra.get("field_b").and_then(|v| v.as_u64()),
            Some(100),
            "field_b should be preserved from first call"
        );

        // field_c from second call added (no conflict)
        assert_eq!(
            data0.extra.get("field_c").and_then(|v| v.as_str()),
            Some("new_field"),
            "field_c should be added from second call"
        );
    }
}
