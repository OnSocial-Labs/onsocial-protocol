// --- Event Emission Tests ---
// Tests to validate event format, partition metadata, and emission behavior

#[cfg(test)]
mod event_emission_tests {
    use crate::tests::test_utils::*;
    use crate::events::{EventConfig, Event};
    use crate::constants::*;
    use near_sdk::serde_json::json;
    use near_sdk::test_utils::{accounts, get_logs};
    use near_sdk::{testing_env, AccountId};
    use near_sdk::base64::Engine;
    use crate::groups::kv_permissions::WRITE;
    use borsh::BorshDeserialize;

    fn test_account(index: usize) -> AccountId {
        accounts(index)
    }
    
    // Helper to decode event
    fn decode_event(log: &str) -> Option<Event> {
        if !log.starts_with("EVENT:") {
            return None;
        }
        let base64_data = &log[6..];
        let decoded = near_sdk::base64::engine::general_purpose::STANDARD
            .decode(base64_data)
            .ok()?;
        Event::deserialize(&mut decoded.as_slice()).ok()
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
        
        let event_logs: Vec<_> = logs.iter().filter(|l| l.starts_with("EVENT:")).collect();
        assert!(!event_logs.is_empty(), "Should have events with EVENT: prefix");
        
        println!("✅ Event prefix test passed: {} events emitted", event_logs.len());
    }

    #[test]
    fn test_event_is_valid_base64_borsh() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();
        
        let config = json!({ "is_private": false });
        contract.create_group("base64_test".to_string(), config).unwrap();

        let logs = get_logs();
        
        let mut valid_events = 0;
        for log in logs {
            if let Some(event) = decode_event(&log) {
                assert_eq!(event.evt_standard, EVENT_STANDARD, "Standard should be 'onsocial'");
                assert_eq!(event.version, EVENT_VERSION, "Version should be '1.0.0'");
                assert!(!event.evt_type.is_empty(), "Event type should not be empty");
                assert!(!event.op_type.is_empty(), "Operation type should not be empty");
                valid_events += 1;
                println!("✓ Valid event: type={}, op={}", event.evt_type, event.op_type);
            }
        }
        
        assert!(valid_events > 0, "Should have at least one valid event");
        println!("✅ Base64/Borsh format test passed");
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
                if let Some(ref data) = event.data {
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

    #[test]
    fn test_event_contains_substreams_fields() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();
        
        let config = json!({ "is_private": false });
        contract.create_group("substreams_test".to_string(), config).unwrap();

        let logs = get_logs();

        for (idx, log) in logs.iter().enumerate() {
            if let Some(event) = decode_event(log) {
                if let Some(ref data) = event.data {
                    // evt_id and log_index are mandatory fields
                    assert!(!data.evt_id.is_empty(), "evt_id should not be empty");
                    println!("✓ Event {}: evt_id={}, log_index={}", idx, data.evt_id, data.log_index);
                }
            }
        }

        println!("✅ Substreams fields test passed");
    }

    // ==========================================================================
    // EVENT_CONFIG TESTS
    // ==========================================================================

    #[test]
    fn test_event_config_emit_true_emits_events() {
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let config = json!({ "is_private": false });
        contract.create_group("emit_group".to_string(), config).unwrap();

        let _ = get_logs();

        // Add member with emit=true (explicit)
        let event_config = EventConfig { emit: true, event_type: None };
        contract.add_group_member("emit_group".to_string(), bob.clone(), WRITE, Some(event_config)).unwrap();

        let logs = get_logs();
        let event_logs: Vec<_> = logs.iter().filter(|l| l.starts_with("EVENT:")).collect();
        
        assert!(!event_logs.is_empty(), "Events should be emitted with emit:true");
        
        println!("✅ EventConfig emit:true test passed");
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
        contract.add_group_member("multi_event".to_string(), bob.clone(), WRITE, None).unwrap();

        let logs = get_logs();
        let event_logs: Vec<_> = logs.iter().filter(|l| l.starts_with("EVENT:")).collect();
        
        assert!(event_logs.len() >= 2, "Multiple operations should emit multiple events, got {}", event_logs.len());
        
        println!("✅ Multiple events test passed: {} events", event_logs.len());
    }

    // ==========================================================================
    // EVENT AUTHOR/TIMESTAMP TESTS
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
                if let Some(ref data) = event.data {
                    assert_eq!(data.author, alice.as_str(), "Author should be the signer");
                    println!("✓ Event author: {}", data.author);
                }
            }
        }

        println!("✅ Event author test passed");
    }

    #[test]
    fn test_event_captures_timestamp() {
        let mut contract = init_live_contract();
        let alice = test_account(0);

        testing_env!(get_context_with_deposit(alice.clone(), 10_000_000_000_000_000_000_000_000).build());

        let _ = get_logs();

        let config = json!({ "is_private": false });
        contract.create_group("timestamp_test".to_string(), config).unwrap();

        let logs = get_logs();

        for log in logs {
            if let Some(event) = decode_event(&log) {
                if let Some(ref data) = event.data {
                    assert!(data.timestamp > 0, "Timestamp should be positive");
                    println!("✓ Event timestamp: {}", data.timestamp);
                }
            }
        }

        println!("✅ Event timestamp test passed");
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
                if event.evt_type == "GROUP_UPDATE" && event.op_type == "create_group" {
                    found_group_update = true;
                    println!("✓ Found GROUP_UPDATE/create_group event");
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

        contract.add_group_member("member_evt_test".to_string(), bob.clone(), WRITE, None).unwrap();

        let logs = get_logs();
        
        let mut found_add_member = false;
        for log in logs {
            if let Some(event) = decode_event(&log) {
                if event.op_type == "add_member" {
                    found_add_member = true;
                    println!("✓ Found add_member event: type={}", event.evt_type);
                }
            }
        }

        assert!(found_add_member, "Should emit add_member event");
        println!("✅ Member add event type test passed");
    }
}
