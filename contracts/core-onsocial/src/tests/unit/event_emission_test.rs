// --- Event Emission Tests ---
// Tests to validate NEP-297 event format, partition metadata, and emission behavior

#[cfg(test)]
mod event_emission_tests {
    use crate::tests::test_utils::*;
    use crate::events::types::Event;
    use crate::constants::*;
    use near_sdk::serde_json::{self, json};
    use near_sdk::test_utils::{accounts, get_logs};
    use near_sdk::{testing_env, AccountId};

    const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }
    
    // Helper to decode NEP-297 JSON event
    fn decode_event(log: &str) -> Option<Event> {
        if !log.starts_with(EVENT_JSON_PREFIX) {
            return None;
        }
        let json_data = &log[EVENT_JSON_PREFIX.len()..];
        serde_json::from_str(json_data).ok()
    }

    // ==========================================================================
    // EVENT FORMAT TESTS
    // ==========================================================================

    #[test]
    fn test_event_uses_correct_prefix() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();

        let config = json!({ "is_private": false });
        contract.create_group("event_test".to_string(), config).unwrap();

        let logs = get_logs();
        assert!(!logs.is_empty(), "Should emit at least one log");
        
        let event_logs: Vec<_> = logs.iter().filter(|l| l.starts_with(EVENT_JSON_PREFIX)).collect();
        assert!(!event_logs.is_empty(), "Should have events with EVENT_JSON: prefix");
        
        println!("✅ Event prefix test passed: {} events emitted", event_logs.len());
    }

    #[test]
    fn test_event_is_valid_nep297_json() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();
        
        let config = json!({ "is_private": false });
        contract.create_group("json_test".to_string(), config).unwrap();

        let logs = get_logs();
        
        let mut valid_events = 0;
        for log in logs {
            if let Some(event) = decode_event(&log) {
                assert_eq!(event.standard, EVENT_STANDARD, "Standard should be 'onsocial'");
                assert_eq!(event.version, EVENT_VERSION, "Version should be '1.0.0'");
                assert!(!event.event.is_empty(), "Event type should not be empty");
                assert!(!event.data.is_empty(), "Event data should not be empty");
                if let Some(data) = event.data.first() {
                    assert!(!data.operation.is_empty(), "Operation should not be empty");
                }
                valid_events += 1;
                println!("✓ Valid event: type={}", event.event);
            }
        }
        
        assert!(valid_events > 0, "Should have at least one valid event");
        println!("✅ NEP-297 JSON format test passed");
    }

    #[test]
    fn test_event_contains_partition_metadata() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();
        
        let config = json!({ "is_private": false });
        contract.create_group("partition_meta_test".to_string(), config).unwrap();

        let logs = get_logs();

        let mut found_partition_metadata = false;
        
        for log in logs {
            if let Some(event) = decode_event(&log) {
                if let Some(data) = event.data.first() {
                    if data.partition_id.is_some() {
                        found_partition_metadata = true;
                        let partition = data.partition_id.unwrap();
                        
                        assert!(partition < NUM_PARTITIONS as u16, "Partition ID should be < {}", NUM_PARTITIONS);
                        
                        println!("✓ Partition metadata: partition_id={}", partition);
                    }
                }
            }
        }

        assert!(found_partition_metadata, "At least one event should have partition metadata");
        println!("✅ Partition metadata test passed");
    }

    // ==========================================================================
    // EVENT BATCHING TESTS
    // ==========================================================================

    #[test]
    fn test_group_operations_emit_multiple_events() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();

        let config = json!({ "is_private": false });
        contract.create_group("multi_event".to_string(), config).unwrap();
        contract.add_group_member("multi_event".to_string(), bob.clone()).unwrap();

        let logs = get_logs();
        let event_logs: Vec<_> = logs.iter().filter(|l| l.starts_with(EVENT_JSON_PREFIX)).collect();
        
        assert!(event_logs.len() >= 2, "Multiple operations should emit multiple events, got {}", event_logs.len());
        
        println!("✅ Multiple events test passed: {} events", event_logs.len());
    }

    // ==========================================================================
    // EVENT AUTHOR TESTS
    // ==========================================================================

    #[test]
    fn test_event_captures_author() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();

        let config = json!({ "is_private": false });
        contract.create_group("author_test".to_string(), config).unwrap();

        let logs = get_logs();

        for log in logs {
            if let Some(event) = decode_event(&log) {
                if let Some(data) = event.data.first() {
                    assert_eq!(data.author, alice.as_str(), "Author should be the signer");
                    println!("✓ Event author: {}", data.author);
                }
            }
        }

        println!("✅ Event author test passed");
    }

    // ==========================================================================
    // EVENT TYPE VERIFICATION
    // ==========================================================================

    #[test]
    fn test_group_create_emits_group_update_event() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();

        let config = json!({ "is_private": false });
        contract.create_group("type_test".to_string(), config).unwrap();

        let logs = get_logs();
        
        let mut found_group_update = false;
        for log in logs {
            if let Some(event) = decode_event(&log) {
                if event.event == "GROUP_UPDATE" {
                    if let Some(data) = event.data.first() {
                        if data.operation == "create_group" {
                            found_group_update = true;
                            println!("✓ Found GROUP_UPDATE/create_group event");
                        }
                    }
                }
            }
        }

        assert!(found_group_update, "Should emit GROUP_UPDATE event for create_group");
        println!("✅ Event type verification test passed");
    }

    #[test]
    fn test_member_add_emits_correct_event_type() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("member_evt_test".to_string(), config).unwrap();

        let _ = get_logs();

        contract.add_group_member("member_evt_test".to_string(), bob.clone()).unwrap();

        let logs = get_logs();
        
        let mut found_add_member = false;
        for log in logs {
            if let Some(event) = decode_event(&log) {
                if let Some(data) = event.data.first() {
                    if data.operation == "add_member" {
                        found_add_member = true;
                        println!("✓ Found add_member event: type={}", event.event);
                    }
                }
            }
        }

        assert!(found_add_member, "Should emit add_member event");
        println!("✅ Member add event type test passed");
    }
}
