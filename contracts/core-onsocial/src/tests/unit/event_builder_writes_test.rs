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
}
