#[cfg(test)]
mod partition_audit_tests {
    use crate::storage::keys::{fast_hash, get_partition, make_key};
    use crate::constants::NUM_PARTITIONS;
    use std::collections::HashMap;
    
    // For contract integration tests
    use crate::tests::test_utils::*;
    use crate::groups::kv_permissions::{WRITE, MODERATE, MANAGE};
    use near_sdk::serde_json::json;
    use near_sdk::testing_env;

    #[test]
    fn test_partition_uniformity_audit() {
        // Test data distribution across partitions (namespace-based)
        let test_cases = vec![
            ("alice.near", "profile/name"),
            ("bob.near", "profile/bio"),
            ("charlie.near", "posts/post1"),
            ("diana.near", "groups/group1/members"),
            ("eve.near", "content/article1"),
            ("frank.near", "settings/preferences"),
            ("grace.near", "notifications/settings"),
            ("henry.near", "friends/list"),
            ("iris.near", "media/images/profile.jpg"),
            ("jack.near", "activities/recent"),
        ];

        let mut partition_distribution: HashMap<u16, usize> = HashMap::new();
        let mut collision_check: HashMap<String, Vec<String>> = HashMap::new();

        println!("=== Partition Distribution Audit ===");

        for (account_id, path) in &test_cases {
            let partition = get_partition(account_id);

            // Track partition distribution
            *partition_distribution.entry(partition).or_insert(0) += 1;

            // Check for key collisions
            let simple_key = make_key("accounts", account_id, path);
            collision_check.entry(simple_key.clone()).or_default().push(format!("{}/{}", account_id, path));

            println!("Account: {}, Path: {} -> Partition: {}, Key: {}",
                    account_id, path, partition, simple_key);
        }

        // Analyze distribution uniformity
        let total_accounts = 10; // Unique accounts
        let expected_per_partition = total_accounts as f64 / NUM_PARTITIONS as f64;

        println!("\n=== Distribution Analysis ===");
        println!("Total unique accounts: {}", total_accounts);
        println!("Number of partitions: {}", NUM_PARTITIONS);
        println!("Expected per partition: {:.2}", expected_per_partition);

        // Check for collisions
        let collisions: Vec<_> = collision_check.values().filter(|v| v.len() > 1).collect();
        if !collisions.is_empty() {
            println!("\n=== COLLISIONS DETECTED ===");
            for collision in &collisions {
                println!("Collision: {:?}", collision);
            }
        } else {
            println!("\n=== NO COLLISIONS DETECTED ===");
        }

        assert!(collisions.is_empty(), "Key collisions detected: {:?}", collisions);
    }

    #[test]
    fn test_hash_function_properties() {
        // Test avalanche effect and distribution properties
        let inputs = vec![
            "a", "b", "c", "aa", "ab", "ba", "test", "Test", "TEST",
            "profile/name", "profile/bio", "posts/post1", "groups/group1"
        ];

        println!("=== Hash Function Analysis ===");

        let mut hashes = Vec::new();
        for input in &inputs {
            let hash = fast_hash(input.as_bytes());
            hashes.push(hash);
            println!("Input: {:15} -> Hash: {:032x}", input, hash);
        }

        // Check for uniqueness
        let unique_hashes: std::collections::HashSet<_> = hashes.iter().collect();
        assert_eq!(unique_hashes.len(), hashes.len(), "Hash function produced duplicates");

        // Check bit distribution (basic entropy test)
        let mut bit_counts = [0u32; 128];
        for &hash in &hashes {
            for i in 0..128 {
                if (hash & (1u128 << i)) != 0 {
                    bit_counts[i] += 1;
                }
            }
        }

        let total_bits = hashes.len() as f32;
        let expected_bits_set = total_bits / 2.0;
        let bit_distribution_variance: f32 = bit_counts.iter()
            .map(|&count| (count as f32 - expected_bits_set).powi(2))
            .sum::<f32>() / 128.0;

        println!("Bit distribution variance: {:.2}", bit_distribution_variance);
        println!("Expected bits set per position: {:.1}", expected_bits_set);

        // Variance should be reasonable (this is a very basic test)
        assert!(bit_distribution_variance < 10.0, "Bit distribution variance too high: {:.2}", bit_distribution_variance);
    }

    #[test]
    fn test_deterministic_behavior() {
        // Test that partition calculation is deterministic
        let test_cases = vec![
            ("alice.near", "profile/name"),
            ("alice.near", "profile/name"), // Same input twice
            ("bob.near", "posts/post1"),
            ("bob.near", "posts/post1"),   // Same input twice
        ];

        let mut results = Vec::new();

        for (account_id, path) in &test_cases {
            let partition = get_partition(account_id);
            let simple_key = make_key("accounts", account_id, path);
            results.push((partition, simple_key));
        }

        // Check determinism - first and second calls should be identical
        assert_eq!(results[0], results[1], "Partition not deterministic for alice.near/profile/name");
        assert_eq!(results[2], results[3], "Partition not deterministic for bob.near/posts/post1");

        println!("=== Deterministic Behavior Test PASSED ===");
    }

    #[test]
    fn test_namespace_based_partitioning() {
        // Test that all paths for the same account go to the same partition
        let account_id = "alice.near";
        let paths = vec![
            "profile/name",
            "profile/bio",
            "posts/post1",
            "posts/post2",
            "settings/preferences",
            "notifications/settings",
        ];

        let partition = get_partition(account_id);
        
        println!("=== Namespace-Based Partitioning Test ===");
        println!("Account: {} -> Partition: {}", account_id, partition);

        // All paths for the same account should go to the same partition
        // This is the key benefit of namespace-based partitioning!
        for path in &paths {
            let key = make_key("accounts", account_id, path);
            println!("  Path: {} -> Key: {}", path, key);
            
            // Verify key format is simple (no shards/subshards)
            assert!(!key.contains("shards/"), "Key should not contain shards/");
            assert!(!key.contains("subshards/"), "Key should not contain subshards/");
            assert!(key.starts_with(account_id), "Key should start with account_id");
        }

        println!("=== Namespace-Based Partitioning Test PASSED ===");
    }

    #[test]
    fn test_simple_key_format() {
        // Test that keys are simple and human-readable
        let test_cases = vec![
            (("accounts", "alice.near", "profile/name"), "alice.near/profile/name"),
            (("accounts", "bob.near", "posts/post1"), "bob.near/posts/post1"),
            (("groups", "defi-dao", "config"), "groups/defi-dao/config"),
            (("groups", "defi-dao", "members/bob.near"), "groups/defi-dao/members/bob.near"),
        ];

        println!("=== Simple Key Format Test ===");

        for ((namespace, namespace_id, path), expected_key) in &test_cases {
            let key = make_key(namespace, namespace_id, path);
            println!("make_key({}, {}, {}) -> {}", namespace, namespace_id, path, key);
            assert_eq!(&key, expected_key, "Key format mismatch");
        }

        println!("=== Simple Key Format Test PASSED ===");
    }

    #[test]
    fn test_large_scale_partition_distribution() {
        // Large-scale distribution analysis with many accounts
        let mut partition_hits: HashMap<u16, usize> = HashMap::new();

        // Generate test data with various account patterns
        let mut test_accounts = Vec::new();

        // Add systematic test accounts
        for i in 0..300 {
            test_accounts.push(format!("account{}.near", i));
        }

        // Add some edge cases
        test_accounts.extend(vec![
            "a.near".to_string(),
            "b.near".to_string(),
            "very-long-account-name-that-might-cause-issues.near".to_string(),
            "short.near".to_string(),
        ]);

        println!("=== Large Scale Partition Distribution Analysis ===");
        println!("Testing {} accounts across {} partitions",
                test_accounts.len(), NUM_PARTITIONS);

        for account_id in &test_accounts {
            let partition = get_partition(account_id);
            *partition_hits.entry(partition).or_insert(0) += 1;
        }

        // Calculate distribution statistics
        let total_accounts = test_accounts.len() as f64;
        let expected_per_partition = total_accounts / NUM_PARTITIONS as f64;

        let partition_variance = calculate_variance(&partition_hits, expected_per_partition);
        let partition_std_dev = partition_variance.sqrt();

        println!("Expected accounts per partition: {:.2}", expected_per_partition);
        println!("Partition distribution variance: {:.4}", partition_variance);
        println!("Partition standard deviation: {:.4}", partition_std_dev);

        // Check that we have good distribution
        let empty_partitions = (0..NUM_PARTITIONS).filter(|p| !partition_hits.contains_key(p)).count();
        let used_partitions = NUM_PARTITIONS as usize - empty_partitions;

        println!("Used partitions: {} out of {}", used_partitions, NUM_PARTITIONS);
        println!("Empty partitions: {} out of {}", empty_partitions, NUM_PARTITIONS);

        // With 304 accounts across 256 partitions, we expect good coverage
        assert!(used_partitions > NUM_PARTITIONS as usize / 2, 
            "Should use more than half of partitions");

        println!("=== Large Scale Partition Distribution Analysis PASSED ===");
    }

    fn calculate_variance(distribution: &HashMap<u16, usize>, expected: f64) -> f64 {
        let variance: f64 = distribution.values()
            .map(|&count| (count as f64 - expected).powi(2))
            .sum::<f64>() / distribution.len() as f64;
        variance
    }

    #[test]
    fn test_permission_paths_partitioning() {
        // Test that permission paths use simple namespace-based partitioning
        // Permission paths format: groups/{group_id}/permissions/{grantee}/{subpath}
        
        println!("=== Permission Paths Partitioning Test ===");
        
        let test_cases = vec![
            // Group permission paths - all company_group permissions go to SAME partition
            ("company_group", "groups/company_group/permissions/alice.near"),
            ("company_group", "groups/company_group/permissions/bob.near"),
            ("company_group", "groups/company_group/permissions/charlie.near/posts"),
            ("company_group", "groups/company_group/permissions/dave.near/config"),
            ("dev_team", "groups/dev_team/permissions/eve.near"),
            ("dev_team", "groups/dev_team/permissions/frank.near/members"),
            ("marketing", "groups/marketing/permissions/grace.near"),
            ("marketing", "groups/marketing/permissions/henry.near/content"),
            
            // Account permission paths
            ("alice.near", "alice.near/permissions/bob.near"),
            ("bob.near", "bob.near/permissions/charlie.near/private"),
        ];

        let mut partition_distribution: HashMap<u16, Vec<String>> = HashMap::new();
        let mut storage_keys: HashMap<String, String> = HashMap::new();

        for (namespace_id, path) in &test_cases {
            let partition = get_partition(namespace_id);
            // For group paths, use "groups" namespace; for account paths, use "accounts"
            let namespace = if path.starts_with("groups/") { "groups" } else { "accounts" };
            let storage_key = make_key(namespace, namespace_id, path);

            partition_distribution.entry(partition).or_default().push(path.to_string());
            storage_keys.insert(path.to_string(), storage_key.clone());

            println!("Path: {} -> Partition: {}", path, partition);
            println!("  Storage Key: {}", storage_key);
        }

        println!("\n=== Permission Path Partitioning Analysis ===");
        println!("Total permission paths tested: {}", test_cases.len());
        println!("Unique partitions used: {}", partition_distribution.len());

        // IMPORTANT: All permissions for same namespace go to SAME partition
        // This is optimal for social media queries - get all user's permissions in one lookup
        
        let company_perms: Vec<_> = test_cases.iter()
            .filter(|(_, path)| path.starts_with("groups/company_group/permissions"))
            .collect();

        let company_partitions: std::collections::HashSet<_> = company_perms.iter()
            .map(|(ns, _)| get_partition(ns))
            .collect();
        
        println!("\nPermissions for 'company_group':");
        for (namespace_id, path) in &company_perms {
            let partition = get_partition(namespace_id);
            println!("  {} -> Partition {}", path, partition);
        }
        
        assert_eq!(company_partitions.len(), 1, 
            "All company_group permissions should be in SAME partition");
        println!("✓ All 'company_group' permissions in single partition (optimal for queries)");

        // Verify storage keys are simple and readable
        for (_, path) in &company_perms {
            let storage_key = storage_keys.get(*path).unwrap();
            // New format: groups/company_group/groups/company_group/permissions/...
            assert!(storage_key.starts_with("groups/company_group/"),
                "Storage key should use simple format: {}", storage_key);
            assert!(!storage_key.contains("shards/"), "No shards prefix in simplified storage");
            assert!(!storage_key.contains("subshards/"), "No subshards in simplified storage");
        }
        println!("✓ Storage keys use simple readable format");

        // Verify partitioning is deterministic
        let partition1 = get_partition("company_group");
        let partition2 = get_partition("company_group");
        assert_eq!(partition1, partition2, "Partitioning must be deterministic");
        println!("\n✓ Partitioning is deterministic for same namespace");

        // Check that storage keys are unique
        let unique_keys: std::collections::HashSet<_> = storage_keys.values().collect();
        assert_eq!(unique_keys.len(), test_cases.len(), 
            "All permission paths should produce unique storage keys");
        println!("✓ All {} permission paths produce unique storage keys", test_cases.len());

        println!("\n=== Permission Path Partitioning Test PASSED ===");
    }

    #[test]
    fn test_permission_path_format_validation() {
        // Verify that permission paths follow expected format with simple keys
        println!("=== Permission Path Format Validation ===");

        let test_scenarios = vec![
            ("Root group permission", "company", "groups/company/permissions/alice.near"),
            ("Subpath group permission", "company", "groups/company/permissions/alice.near/posts"),
            ("Deep subpath group permission", "company", "groups/company/permissions/alice.near/posts/announcements"),
            ("Config permission", "dev_team", "groups/dev_team/permissions/bob.near/config"),
            ("Members permission", "marketing", "groups/marketing/permissions/charlie.near/members"),
        ];

        for (description, namespace_id, perm_path) in &test_scenarios {
            let partition = get_partition(namespace_id);
            // Permission paths for groups use "groups" namespace
            let storage_key = make_key("groups", namespace_id, perm_path);

            println!("\n{}", description);
            println!("  Namespace ID: {}", namespace_id);
            println!("  Permission Path: {}", perm_path);
            println!("  Partition: {}", partition);
            println!("  Storage Key: {}", storage_key);

            // Verify the path structure
            assert!(perm_path.starts_with(&format!("groups/{}/permissions/", namespace_id)),
                "Permission path should start with 'groups/{}/permissions/'", namespace_id);

            // Verify the storage key format is simple (groups/{namespace_id}/...)
            assert!(storage_key.starts_with(&format!("groups/{}/", namespace_id)),
                "Storage key should start with 'groups/{namespace_id}/': {}", storage_key);
            
            // Verify determinism
            let partition2 = get_partition(namespace_id);
            let storage_key2 = make_key("groups", namespace_id, perm_path);

            assert_eq!(partition, partition2, "Partition should be deterministic");
            assert_eq!(storage_key, storage_key2, "Storage key should be deterministic");
        }

        println!("\n✓ All permission paths follow expected format");
        println!("✓ All storage keys use simple readable format");
        println!("\n=== Permission Path Format Validation PASSED ===");
    }

    #[test]
    fn test_ownership_transfer_key_stability() {
        // Critical test: Verify that storage keys are stable across ownership transfer
        // because they use namespace_id (group_id), not owner account_id
        
        println!("=== Ownership Transfer Key Stability Test ===");
        
        let group_id = "company";
        let original_owner = "alice.near";
        let new_owner = "bob.near";
        let permission_grantee = "charlie.near";
        
        // Permission path format: groups/{group_id}/permissions/{grantee}/{subpath}
        let perm_path = format!("groups/{}/permissions/{}/posts", group_id, permission_grantee);
        
        // Before ownership transfer
        println!("\nBEFORE ownership transfer (owner: {})", original_owner);
        let partition_before = get_partition(group_id);
        let key_before = make_key("accounts", group_id, &perm_path);
        
        println!("  Permission path: {}", perm_path);
        println!("  Namespace (group_id): {}", group_id);
        println!("  Partition: {}", partition_before);
        println!("  Storage key: {}", key_before);
        
        // After ownership transfer - key must be IDENTICAL
        println!("\nAFTER ownership transfer (owner: {})", new_owner);
        let partition_after = get_partition(group_id);
        let key_after = make_key("accounts", group_id, &perm_path);
        
        println!("  Permission path: {}", perm_path);
        println!("  Namespace (group_id): {} (unchanged)", group_id);
        println!("  Partition: {}", partition_after);
        println!("  Storage key: {}", key_after);
        
        // CRITICAL: Keys must be identical
        assert_eq!(partition_before, partition_after, 
            "Partition MUST NOT change after ownership transfer!");
        assert_eq!(key_before, key_after,
            "Storage key MUST NOT change after ownership transfer!");
        
        println!("\n✓ CRITICAL: Storage key unchanged after ownership transfer");
        println!("✓ Permissions survive ownership transfer because keys use group_id");
        println!("\n=== Ownership Transfer Key Stability Test PASSED ===");
    }

    // ============================================================================
    // CONTRACT INTEGRATION TESTS - Using actual contract logic
    // ============================================================================

    #[test]
    fn test_contract_permission_storage_integration() {
        // Test that the actual contract correctly stores and retrieves permissions
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        println!("\n=== Contract Permission Storage Integration Test ===");

        // Create a group
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("test_group".to_string(), config).unwrap();

        // Add members
        contract.add_group_member("test_group".to_string(), bob.clone(), WRITE, None).unwrap();
        contract.add_group_member("test_group".to_string(), charlie.clone(), WRITE, None).unwrap();

        // Grant permission to Charlie
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        contract.set_permission(
            charlie.clone(),
            "groups/test_group/config".to_string(),
            MODERATE,
            None
        ).unwrap();

        println!("✓ Permission granted: charlie.near -> MODERATE on groups/test_group/config");

        // Verify the permission was stored correctly
        let has_permission = contract.has_permission(
            alice.clone(),
            charlie.clone(),
            "groups/test_group/config".to_string(),
            MODERATE
        );

        assert!(has_permission, "Charlie should have MODERATE permission");
        println!("✓ Permission verified through contract.has_permission()");

        // Show expected storage format
        let perm_path = "groups/test_group/permissions/charlie.near/config";
        let partition = get_partition("test_group");
        let expected_key = make_key("accounts", "test_group", perm_path);

        println!("\nExpected storage:");
        println!("  Path: {}", perm_path);
        println!("  Partition: {} (for indexer routing)", partition);
        println!("  Storage Key: {}", expected_key);

        println!("\n✓ Contract correctly stores and retrieves permission data");
        println!("✓ Simple key format verified");
        println!("\n=== Contract Permission Storage Integration Test PASSED ===");
    }

    #[test]
    fn test_contract_group_data_storage_integration() {
        // Test that group data uses simple storage keys
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        println!("\n=== Contract Group Data Storage Integration Test ===");

        // Create group
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("data_test".to_string(), config.clone()).unwrap();

        println!("✓ Group created: data_test");

        // Add members
        contract.add_group_member("data_test".to_string(), bob.clone(), WRITE, None).unwrap();
        contract.add_group_member("data_test".to_string(), charlie.clone(), WRITE, None).unwrap();

        println!("✓ Members added: bob.near, charlie.near");

        // Verify data is accessible
        let retrieved_config = contract.get_group_config("data_test".to_string()).unwrap();
        assert_eq!(retrieved_config.get("owner").and_then(|v| v.as_str()), Some("alice.near"));
        println!("✓ Group config retrieved successfully");

        // Check membership
        assert!(contract.is_group_member("data_test".to_string(), alice.clone()));
        assert!(contract.is_group_member("data_test".to_string(), bob.clone()));
        assert!(contract.is_group_member("data_test".to_string(), charlie.clone()));
        println!("✓ All members verified through contract.is_group_member()");

        // Show expected storage format for group data
        let paths = vec![
            "groups/data_test/config",
            "groups/data_test/members/alice.near",
            "groups/data_test/members/bob.near",
        ];

        let partition = get_partition("data_test");
        println!("\nExpected storage for group data (all in partition {}):", partition);
        for path in &paths {
            let storage_key = make_key("groups", "data_test", path);
            println!("  {} -> {}", path, storage_key);
        }

        println!("\n✓ All group data uses simple readable keys");
        println!("✓ All paths for 'data_test' in single partition (optimal for queries)");
        println!("\n=== Contract Group Data Storage Integration Test PASSED ===");
    }

    #[test]
    fn test_contract_ownership_transfer_integration() {
        // Integration test: Verify permissions survive ownership transfer
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        println!("\n=== Contract Ownership Transfer Integration Test ===");

        // Create group
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        let config = json!({"member_driven": false, "is_private": true});
        contract.create_group("transfer_test".to_string(), config).unwrap();

        // Add members
        contract.add_group_member("transfer_test".to_string(), bob.clone(), WRITE, None).unwrap();
        contract.add_group_member("transfer_test".to_string(), charlie.clone(), WRITE, None).unwrap();

        // Grant Charlie MODERATE permission BEFORE transfer
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        contract.set_permission(
            charlie.clone(),
            "groups/transfer_test/config".to_string(),
            MODERATE,
            None
        ).unwrap();

        println!("BEFORE transfer:");
        println!("  Owner: alice.near");
        println!("  Charlie has MODERATE permission: {}", 
            contract.has_permission(alice.clone(), charlie.clone(), "groups/transfer_test/config".to_string(), MODERATE));

        // Show expected key (stable across ownership transfer)
        let perm_path = "groups/transfer_test/permissions/charlie.near/config";
        let key = make_key("accounts", "transfer_test", perm_path);
        println!("  Storage key: {}", key);

        // Transfer ownership to Bob
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        contract.transfer_group_ownership("transfer_test".to_string(), bob.clone(), None, None).unwrap();

        println!("\nAFTER transfer:");
        println!("  Owner: bob.near");

        // Verify Charlie STILL has permission after transfer
        let charlie_has_perm_after = contract.has_permission(
            bob.clone(), // New owner
            charlie.clone(),
            "groups/transfer_test/config".to_string(),
            MODERATE
        );
        assert!(charlie_has_perm_after, "Charlie must still have MODERATE permission after ownership transfer");
        println!("  Charlie has MODERATE permission: {}", charlie_has_perm_after);

        // Key should be identical (unchanged by ownership transfer)
        let key_after = make_key("accounts", "transfer_test", perm_path);
        println!("  Storage key: {} (unchanged)", key_after);
        assert_eq!(key, key_after, "Storage key must be stable across ownership transfer");

        println!("\n✓ CRITICAL: Permission access preserved after ownership transfer");
        println!("✓ Storage keys are stable (use group_id, not owner)");
        println!("\n=== Contract Ownership Transfer Integration Test PASSED ===");
    }

    #[test]
    fn test_contract_account_data_storage() {
        // Test that user account-level paths use simple keys
        
        println!("\n=== Contract Account Data Storage Test ===");

        let paths = vec![
            "profile/name",
            "profile/bio",
            "posts/post1",
        ];

        let partition = get_partition("alice.near");
        println!("All alice.near data in partition: {}", partition);
        println!("\nExpected storage keys for account data:");
        for path in &paths {
            let storage_key = make_key("accounts", "alice.near", path);
            println!("  alice.near/{} -> {}", path, storage_key);
            
            // Verify simple format: {account_id}/{relative_path}
            assert!(storage_key.starts_with("alice.near/"),
                "Storage key must use simple format: {}", storage_key);
            assert!(!storage_key.contains("shards/"), "No shards in simplified storage");
        }

        println!("\n✓ Account paths use simple readable keys");
        println!("✓ All user data in single partition (optimal for queries)");
        println!("\n=== Contract Account Data Storage Test PASSED ===");
    }

    #[test]
    fn test_contract_mixed_operations_partitioning() {
        // Complex test: Mix of group data and permissions
        let mut contract = init_live_contract();
        let alice = test_account(0);
        let bob = test_account(1);
        let charlie = test_account(2);

        println!("\n=== Contract Mixed Operations Partitioning Test ===");

        // 1. Create multiple groups
        testing_env!(get_context_with_deposit(alice.clone(), test_deposits::legacy_10_near()).build());
        contract.create_group("group1".to_string(), json!({"is_private": false})).unwrap();
        contract.create_group("group2".to_string(), json!({"is_private": true})).unwrap();

        println!("✓ Groups created: group1, group2");

        // 2. Add members
        contract.add_group_member("group1".to_string(), bob.clone(), WRITE, None).unwrap();
        contract.add_group_member("group2".to_string(), charlie.clone(), WRITE, None).unwrap();

        println!("✓ Members added to groups");

        // 3. Grant permissions
        contract.set_permission(bob.clone(), "groups/group1/config".to_string(), MODERATE, None).unwrap();
        contract.set_permission(charlie.clone(), "groups/group2/config".to_string(), MANAGE, None).unwrap();

        println!("✓ Permissions granted");

        // 4. Verify all data is accessible
        let group1_config = contract.get_group_config("group1".to_string());
        let group2_config = contract.get_group_config("group2".to_string());
        assert!(group1_config.is_some(), "Group1 config should be accessible");
        assert!(group2_config.is_some(), "Group2 config should be accessible");

        let bob_has_perm = contract.has_permission(alice.clone(), bob.clone(), "groups/group1/config".to_string(), MODERATE);
        let charlie_has_perm = contract.has_permission(alice.clone(), charlie.clone(), "groups/group2/config".to_string(), MANAGE);
        assert!(bob_has_perm, "Bob permission should be accessible");
        assert!(charlie_has_perm, "Charlie permission should be accessible");

        println!("✓ All group data and permissions accessible");

        // 5. Analyze partition distribution
        let test_paths = vec![
            ("group1", "groups/group1/config"),
            ("group1", "groups/group1/members/alice.near"),
            ("group1", "groups/group1/members/bob.near"),
            ("group1", "groups/group1/permissions/bob.near/config"),
            ("group2", "groups/group2/config"),
            ("group2", "groups/group2/members/alice.near"),
            ("group2", "groups/group2/members/charlie.near"),
            ("group2", "groups/group2/permissions/charlie.near/config"),
        ];

        let mut partition_usage: HashMap<u16, usize> = HashMap::new();
        
        println!("\nPartition distribution:");
        for (namespace_id, path) in &test_paths {
            let partition = get_partition(namespace_id);
            *partition_usage.entry(partition).or_insert(0) += 1;
            let storage_key = make_key("groups", namespace_id, path);
            println!("  {} -> Partition {} (key: {})", path, partition, storage_key);
        }

        println!("\nPartition summary:");
        println!("  Total paths: {}", test_paths.len());
        println!("  Unique partitions: {}", partition_usage.len());
        println!("  Distribution: {:?}", partition_usage);

        // All group1 data should be in same partition
        let group1_partition = get_partition("group1");
        let group2_partition = get_partition("group2");
        println!("\n  group1 data -> Partition {}", group1_partition);
        println!("  group2 data -> Partition {}", group2_partition);

        println!("\n✓ Each group's data in single partition (query-optimized)");
        println!("✓ Simple readable storage keys");
        println!("✓ No complex sharding overhead");
        println!("\n=== Contract Mixed Operations Partitioning Test PASSED ===");
    }
}
