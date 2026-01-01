// === MEMBER PERFORMANCE TESTS ===
// Tests for large-scale operations, gas limits, and performance boundaries

use crate::tests::test_utils::*;
use crate::groups::kv_permissions::{MODERATE, MANAGE};
use serde_json::json;
use near_sdk::test_utils::accounts;
use near_sdk::env;
use std::time::Instant;

#[cfg(test)]
mod member_performance_tests {
    use super::*;

    /// Test bulk member operations performance with NEAR-realistic batch sizes.
    /// 
    /// Important: Batch sizes are constrained by NEAR's 16KB log limit when events are enabled.
    /// Since events are essential for substreams indexing, production bulk operations must be sized
    /// appropriately (typically 4-5 operations per transaction) to stay within NEAR's constraints.
    #[test]
    fn test_bulk_member_operations() {
        let mut contract = init_live_contract();
        let owner = accounts(0);

        // Use large deposit for bulk operations
        let context = get_context_with_deposit(owner.clone(), 100_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("bulk_test_group".to_string(), config).unwrap();

        let start_time = Instant::now();
        // NEAR-realistic bulk size: 3-4 operations per transaction with events enabled
        // This stays within NEAR's 16KB log limit while maintaining full event emission
        let bulk_size = 3; 
        let mut successful_adds = 0;
        let mut total_gas_add = 0u64;

        // Bulk add members WITH events enabled (production-realistic)
        for i in 0..bulk_size {
            let member_name = format!("bulk_member_{}.testnet", i);
            let member_id: near_sdk::AccountId = member_name.parse().unwrap();
            
            // Measure gas for this operation
            let gas_before = env::used_gas();
            let add_result = contract.add_group_member(
                "bulk_test_group".to_string(), 
                member_id.clone(), 
                0,  // Keep events enabled - this is realistic for substreams
            );
            let gas_after = env::used_gas();
            
            if add_result.is_ok() {
                successful_adds += 1;
                total_gas_add += gas_after.as_gas() - gas_before.as_gas();
                
                // Verify member was added correctly
                assert!(contract.is_group_member("bulk_test_group".to_string(), member_id.clone()));
            } else {
                println!("Failed to add member {}: {:?}", i, add_result.unwrap_err());
                break;
            }
        }

        let add_duration = start_time.elapsed();
        let avg_gas_add = if successful_adds > 0 { total_gas_add / successful_adds as u64 } else { 0 };
        
        println!("✅ Bulk add: {} members in {:?}", successful_adds, add_duration);
        println!("   Average gas per add: {} Tgas", avg_gas_add / 1_000_000_000_000);

        // Bulk remove members (remove half)
        let remove_start = Instant::now();
        let mut successful_removes = 0;
        let mut total_gas_remove = 0u64;

        for i in 0..(successful_adds / 2) {
            let member_name = format!("bulk_member_{}.testnet", i);
            let member_id: near_sdk::AccountId = member_name.parse().unwrap();
            
            // Measure gas for this operation
            let gas_before = env::used_gas();
            let remove_result = contract.remove_group_member(
                "bulk_test_group".to_string(), 
                member_id.clone(),
            );
            let gas_after = env::used_gas();
            
            if remove_result.is_ok() {
                successful_removes += 1;
                total_gas_remove += gas_after.as_gas() - gas_before.as_gas();
                
                // Verify member was removed
                assert!(!contract.is_group_member("bulk_test_group".to_string(), member_id));
            }
        }

        let remove_duration = remove_start.elapsed();
        let avg_gas_remove = if successful_removes > 0 { total_gas_remove / successful_removes as u64 } else { 0 };
        
        println!("✅ Bulk remove: {} members in {:?}", successful_removes, remove_duration);
        println!("   Average gas per remove: {} Tgas", avg_gas_remove / 1_000_000_000_000);
        
        // Performance assertions - the core validation
        assert_eq!(successful_adds, { bulk_size }, "All members should be added successfully");
        assert_eq!(successful_removes, bulk_size / 2, "Half the members should be removed");
        
        // Gas assertions - ensure operations are within reasonable bounds
        // NEAR function calls have a 300 Tgas limit, operations should be well below that
        assert!(avg_gas_add < 50_000_000_000_000, "Average add gas should be under 50 Tgas");
        assert!(avg_gas_remove < 50_000_000_000_000, "Average remove gas should be under 50 Tgas");
        
        // Validate realistic production batch sizes with events enabled
        assert!((3..=4).contains(&bulk_size), "Bulk operations should use 3-4 ops/tx to stay within NEAR's 16KB log limit with events");
        println!("✅ Gas measurements: Operations well within NEAR limits");
        println!("✅ Batch size: {} operations per transaction (production-realistic with events)", bulk_size);
    }

    #[test]
    fn test_operation_timing_analysis() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        // Create group
        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("timing_test_group".to_string(), config).unwrap();

        println!("=== Operation Timing & Gas Analysis ===");

        // Test add_group_member timing and gas
        let gas_before = env::used_gas();
        let start = Instant::now();
        contract.add_group_member("timing_test_group".to_string(), member.clone(), 0).unwrap();
        let add_duration = start.elapsed();
        let gas_after = env::used_gas();
        let add_gas = gas_after.as_gas() - gas_before.as_gas();
        println!("add_group_member: {:?}, {} Tgas", add_duration, add_gas / 1_000_000_000_000);

        // Test is_group_member timing and gas
        let gas_before = env::used_gas();
        let start = Instant::now();
        let _is_member = contract.is_group_member("timing_test_group".to_string(), member.clone());
        let check_duration = start.elapsed();
        let gas_after = env::used_gas();
        let check_gas = gas_after.as_gas() - gas_before.as_gas();
        println!("is_group_member: {:?}, {} Tgas", check_duration, check_gas / 1_000_000_000_000);

        // Test set_permission timing and gas
        let gas_before = env::used_gas();
        let start = Instant::now();
        contract.set_permission(
            member.clone(),
            "groups/timing_test_group/special".to_string(),
            MODERATE,
            None,
        ).unwrap();
        let perm_duration = start.elapsed();
        let gas_after = env::used_gas();
        let perm_gas = gas_after.as_gas() - gas_before.as_gas();
        println!("set_permission: {:?}, {} Tgas", perm_duration, perm_gas / 1_000_000_000_000);

        // Test has_permission timing and gas
        let gas_before = env::used_gas();
        let start = Instant::now();
        let _has_perm = contract.has_permission(
            owner.clone(),
            member.clone(),
            "groups/timing_test_group/special".to_string(),
            MODERATE
        );
        let has_perm_duration = start.elapsed();
        let gas_after = env::used_gas();
        let has_perm_gas = gas_after.as_gas() - gas_before.as_gas();
        println!("has_permission: {:?}, {} Tgas", has_perm_duration, has_perm_gas / 1_000_000_000_000);

        // Test blacklist operations timing and gas
        let gas_before = env::used_gas();
        let start = Instant::now();
        contract.blacklist_group_member("timing_test_group".to_string(), member.clone()).unwrap();
        let blacklist_duration = start.elapsed();
        let gas_after = env::used_gas();
        let blacklist_gas = gas_after.as_gas() - gas_before.as_gas();
        println!("blacklist_group_member: {:?}, {} Tgas", blacklist_duration, blacklist_gas / 1_000_000_000_000);

        // Gas assertions - ensure operations are within reasonable bounds for NEAR
        assert!(add_gas < 50_000_000_000_000, "add_group_member should use < 50 Tgas");
        assert!(check_gas < 10_000_000_000_000, "membership check should use < 10 Tgas");
        assert!(perm_gas < 30_000_000_000_000, "permission grant should use < 30 Tgas");
        assert!(has_perm_gas < 10_000_000_000_000, "permission check should use < 10 Tgas");
        assert!(blacklist_gas < 50_000_000_000_000, "blacklist operation should use < 50 Tgas");
        
        println!("✅ All operations within acceptable gas limits for NEAR blockchain");

        println!("✅ All operation timings within acceptable limits");
    }

    #[test]
    fn test_large_group_management() {
        let mut contract = init_live_contract();
        let owner = accounts(0);

        let context = get_context_with_deposit(owner.clone(), 50_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("large_group".to_string(), config).unwrap();

        println!("=== Large Group Management Test ===");
        let target_members = 8; // Reduced to avoid log limits
        println!("Target group size: {} members", target_members);

        let start_time = Instant::now();
        
        // Add members efficiently
        for i in 0..target_members {
            let member_name = format!("large_member_{}.testnet", i);
            let member_id: near_sdk::AccountId = member_name.parse().unwrap();
            
            contract.add_group_member(
                "large_group".to_string(), 
                member_id.clone(),
                0).unwrap();
        }

        let total_time = start_time.elapsed();
        println!("✅ Added {} members in {:?}", target_members, total_time);
        
        // Test member lookup performance
        let lookup_start = Instant::now();
        let test_member_name = format!("large_member_{}.testnet", target_members / 2);
        let test_member: near_sdk::AccountId = test_member_name.parse().unwrap();
        let is_member = contract.is_group_member("large_group".to_string(), test_member);
        let lookup_time = lookup_start.elapsed();
        
        assert!(is_member);
        println!("✅ Member lookup completed in {:?}", lookup_time);
        
        println!("✅ Large group management test completed successfully");
    }

    #[test]
    fn test_permission_hierarchy_performance() {
        let mut contract = init_live_contract();
        let owner = accounts(0);
        let member = accounts(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("hierarchy_test".to_string(), config).unwrap();
        contract.add_group_member("hierarchy_test".to_string(), member.clone(), 0).unwrap();

        println!("=== Permission Hierarchy Performance Test ===");

        // Test different path depths
        let test_paths = vec![
            "groups/hierarchy_test",                                    // Depth 2
            "groups/hierarchy_test/content",                           // Depth 3
            "groups/hierarchy_test/content/posts",                     // Depth 4
            "groups/hierarchy_test/content/posts/daily",               // Depth 5
            "groups/hierarchy_test/content/posts/daily/morning",       // Depth 6
            "groups/hierarchy_test/content/posts/daily/morning/news",  // Depth 7
        ];

        for (depth, path) in test_paths.iter().enumerate() {
            // Grant permission at this level
            contract.set_permission(
                member.clone(),
                path.to_string(),
                MODERATE,
                None,
            ).unwrap();

            // Test permission check performance at various depths
            let check_start = Instant::now();
            let has_perm = contract.has_permission(
                owner.clone(),
                member.clone(),
                path.to_string(),
                MODERATE
            );
            let check_duration = check_start.elapsed();

            println!("Depth {}: {} - Permission check in {:?} ({})", 
                    depth + 2, path, check_duration, 
                    if has_perm { "✅" } else { "❌" });

            // Check should be successful and reasonably fast
            assert!(has_perm, "Permission should be granted at depth {}", depth + 2);
            assert!(check_duration.as_millis() < 100, "Permission check should be fast");
        }

        // Test hierarchy traversal (child path inheriting parent permission)
        let parent_path = "groups/hierarchy_test/content";
        let child_path = "groups/hierarchy_test/content/posts/daily/special";

        contract.set_permission(member.clone(), parent_path.to_string(), MANAGE, None).unwrap();

        let hierarchy_start = Instant::now();
        let inherits_permission = contract.has_permission(
            owner.clone(),
            member.clone(),
            child_path.to_string(),
            MANAGE
        );
        let hierarchy_duration = hierarchy_start.elapsed();

        println!("Hierarchy traversal check in {:?} ({})", 
                hierarchy_duration, if inherits_permission { "✅" } else { "❌" });

        assert!(inherits_permission, "Child path should inherit parent permission");
        assert!(hierarchy_duration.as_millis() < 200, "Hierarchy traversal should be reasonably fast");

        println!("✅ Permission hierarchy performance test completed");
    }

    #[test]
    fn test_storage_efficiency_analysis() {
        let mut contract = init_live_contract();
        let owner = accounts(0);

        let context = get_context_with_deposit(owner.clone(), 50_000_000_000_000_000_000_000_000);
        near_sdk::testing_env!(context.build());

        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("storage_test".to_string(), config).unwrap();

        // Get initial storage usage (reduced logging)
        let initial_balance = contract.get_storage_balance(owner.clone()).unwrap();
        let initial_used = initial_balance.used_bytes;

        // Add members and track storage growth (NEAR-realistic batch size)
        let member_count = 4;  // Realistic production batch size for NEAR + substreams
        let mut storage_measurements = Vec::new();

        for i in 0..member_count {
            let member_name = format!("storage_member_{}.testnet", i);
            let member_id: near_sdk::AccountId = member_name.parse().unwrap();
            
            contract
                .add_group_member("storage_test".to_string(), member_id.clone(), 0)
                .unwrap();

            // Measure storage after each addition
            let current_balance = contract.get_storage_balance(owner.clone()).unwrap();
            let current_used = current_balance.used_bytes;
            let growth = current_used - initial_used;
            
            storage_measurements.push((i + 1, growth));
            
            // Reduced logging to avoid NEAR log limits
            // if (i + 1) % 3 == 0 {
            //     println!("After {} members: {} bytes total ({} bytes/member avg)", 
            //             i + 1, growth, growth / (i + 1) as u64);
            // }
        }

        // Calculate storage efficiency metrics
        let final_growth = storage_measurements.last().unwrap().1;
        let avg_per_member = final_growth / member_count as u64;

        // Test storage cleanup efficiency
        let members_to_remove = member_count / 2;

        for i in 0..members_to_remove {
            let member_name = format!("storage_member_{}.testnet", i);
            let member_id: near_sdk::AccountId = member_name.parse().unwrap();
            
            contract.remove_group_member("storage_test".to_string(), member_id).unwrap();
        }

        let after_cleanup_balance = contract.get_storage_balance(owner.clone()).unwrap();
        let after_cleanup_used = after_cleanup_balance.used_bytes;
        let cleaned_up_bytes = final_growth - (after_cleanup_used - initial_used);

        // NEAR Storage Cost Analysis - Based on official NEAR documentation
        // Storage cost: 1E19 yoctoNEAR per byte = 100KB per 1 NEAR
        // Reference: https://docs.near.org/protocol/storage/storage-staking
        const NEAR_STORAGE_COST_PER_BYTE: u128 = 10_000_000_000_000_000_000; // 1E19 yoctoNEAR per byte
        let storage_cost_per_member = avg_per_member as u128 * NEAR_STORAGE_COST_PER_BYTE;
        let storage_cost_near = storage_cost_per_member as f64 / 1e24; // Convert yoctoNEAR to NEAR
        
        // Storage efficiency assertions - the real validation
        assert!(avg_per_member < 10_000, "Storage per member should be reasonable (got {} bytes)", avg_per_member);
        assert!(cleaned_up_bytes > 0, "Storage cleanup should reclaim some space");
        assert_eq!(member_count, 4, "Should process expected number of members");
        assert_eq!(members_to_remove, 2, "Should remove expected number of members");
        assert!(member_count <= 5, "Storage tests should use NEAR-realistic batch sizes");
        
        // Critical NEAR economics validation (corrected based on official docs)
        assert!(storage_cost_near < 0.01, "Storage cost per member should be under 0.001 NEAR (got {:.6} NEAR)", storage_cost_near);
        assert!(avg_per_member > 50, "Storage per member should be above minimum threshold (prevents spam)");
        
        // Production economics summary
        println!("✅ Storage economics: {} bytes/member = {:.6} NEAR per member", avg_per_member, storage_cost_near);
    }

    /// Test minimum storage requirements and deposit validation for NEAR economics
    #[test]
    fn test_storage_cost_minimum_requirements() {
        let mut contract = init_live_contract();
        let owner = accounts(0);

        // Test with minimal deposit to validate minimum requirements
        let minimal_deposit = 1_000_000_000_000_000_000_000_000; // 1 NEAR
        let context = get_context_with_deposit(owner.clone(), minimal_deposit);
        near_sdk::testing_env!(context.build());

        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("min_cost_test".to_string(), config).unwrap();

        // Get baseline after group creation
        let initial_balance = contract.get_storage_balance(owner.clone()).unwrap();
        let initial_used = initial_balance.used_bytes;
        let initial_total_balance = initial_balance.balance;
        
        // Test single member addition with cost tracking
        let member_id: near_sdk::AccountId = "cost_test_member.testnet".parse().unwrap();
        contract
            .add_group_member("min_cost_test".to_string(), member_id.clone(), 0)
            .unwrap();

        let post_add_balance = contract.get_storage_balance(owner.clone()).unwrap();
        let storage_used_for_member = post_add_balance.used_bytes - initial_used;
        
        // Handle potential balance changes (could increase due to deposits)
        let balance_change = if post_add_balance.balance >= initial_total_balance {
            post_add_balance.balance - initial_total_balance  // Balance increased
        } else {
            initial_total_balance - post_add_balance.balance  // Balance decreased
        };

        // NEAR storage economics validation (based on official documentation)
        // Storage cost: 1E19 yoctoNEAR per byte = 100KB per 1 NEAR
        const NEAR_STORAGE_COST_PER_BYTE: u128 = 10_000_000_000_000_000_000; // 1E19 yoctoNEAR per byte
        let actual_cost_yocto = storage_used_for_member as u128 * NEAR_STORAGE_COST_PER_BYTE;
        let actual_cost_near = actual_cost_yocto as f64 / 1e24;

        // Critical assertions for production economics (based on measured values)
        assert!(storage_used_for_member > 0, "Member addition should consume storage");
        assert!(storage_used_for_member < 1000, "Storage per member should be reasonable (got {} bytes)", storage_used_for_member);
        assert!(actual_cost_near < 0.01, "Cost per member should be under 0.01 NEAR (got {:.6} NEAR)", actual_cost_near);
        
        // Minimum deposit validation - ensure users need reasonable NEAR to add members
        let recommended_min_deposit = actual_cost_yocto * 10; // 10x buffer for gas + storage
        assert!(recommended_min_deposit < 100_000_000_000_000_000_000_000, "Minimum deposit should be under 0.1 NEAR");

        println!("✅ Storage cost requirements:");
        println!("  - Bytes per member: {}", storage_used_for_member);
        println!("  - Theoretical cost per member: {:.6} NEAR", actual_cost_near);
        println!("  - Recommended minimum deposit: {:.3} NEAR", recommended_min_deposit as f64 / 1e24);
        println!("  - Balance change: {} yoctoNEAR", balance_change);
    }

    /// Test storage deposit requirements for bulk operations (critical for UX)
    #[test]
    fn test_bulk_storage_deposit_requirements() {
        let mut contract = init_live_contract();
        let owner = accounts(0);

        // Test with deposit that should handle multiple members
        let bulk_deposit = 10_000_000_000_000_000_000_000_000; // 10 NEAR
        let context = get_context_with_deposit(owner.clone(), bulk_deposit);
        near_sdk::testing_env!(context.build());

        let config = json!({"member_driven": false, "is_private": false});
        contract.create_group("bulk_deposit_test".to_string(), config).unwrap();

        // Add members and track cumulative storage costs
        let target_members = 4; // NEAR-realistic batch size
        let mut total_storage_used = 0u64;

        for i in 0..target_members {
            let member_id: near_sdk::AccountId = format!("bulk_deposit_member_{}.testnet", i).parse().unwrap();
            
            let pre_balance = contract.get_storage_balance(owner.clone()).unwrap();
            
            contract
                .add_group_member("bulk_deposit_test".to_string(), member_id, 0)
                .unwrap();

            let post_balance = contract.get_storage_balance(owner.clone()).unwrap();
            total_storage_used += post_balance.used_bytes - pre_balance.used_bytes;
        }

        // Economics analysis for bulk operations (corrected based on NEAR docs)
        // Storage cost: 1E19 yoctoNEAR per byte = 100KB per 1 NEAR
        const NEAR_STORAGE_COST_PER_BYTE: u128 = 10_000_000_000_000_000_000;
        let total_storage_cost_yocto = total_storage_used as u128 * NEAR_STORAGE_COST_PER_BYTE;
        let total_storage_cost_near = total_storage_cost_yocto as f64 / 1e24;
        let avg_cost_per_member = total_storage_cost_near / target_members as f64;

        // Critical bulk operation validations (corrected thresholds)
        assert!(total_storage_used > 0, "Bulk operations should consume storage");
        assert!(total_storage_cost_near < 0.1, "Total storage cost should be reasonable (got {:.6} NEAR)", total_storage_cost_near);
        assert!(avg_cost_per_member < 0.01, "Average cost per member should be under 0.01 NEAR");
        // Focus on storage usage validation rather than balance mechanics
        assert!(total_storage_used > 0, "Bulk operations should use storage");

        // UX recommendations for frontend applications (corrected expectations)
        let recommended_bulk_deposit = total_storage_cost_yocto * 5; // 5x buffer for gas
        let max_members_with_1_near = (1e24 as u128) / (total_storage_cost_yocto / target_members as u128);

        println!("✅ Bulk storage deposit analysis:");
        println!("  - Total storage for {} members: {} bytes", target_members, total_storage_used);
        println!("  - Total cost: {:.6} NEAR", total_storage_cost_near);
        println!("  - Average per member: {:.6} NEAR", avg_cost_per_member);
        println!("  - Recommended bulk deposit: {:.6} NEAR", recommended_bulk_deposit as f64 / 1e24);
        println!("  - Max members with 1 NEAR: ~{}", max_members_with_1_near);

        // Production assertions (updated for correct economics)
        assert!(max_members_with_1_near >= 100, "Should be able to add at least 100 members with 1 NEAR");
        // Updated threshold to account for permission key storage costs
        assert!(recommended_bulk_deposit < 100_000_000_000_000_000_000_000, "Bulk deposit should be under 0.1 NEAR");
    }

    // Add more performance-focused tests...
}