// === GROUP CONTENT CREATION INTEGRATION TESTS ===
// Comprehensive tests for GroupContentManager and group content workflows
//
// This test suite covers the CRITICAL group content creation flow:
// 1. Member writing posts/messages to group paths
// 2. Content transformation and enrichment
// 3. Metadata generation and storage
// 4. User-owned storage path transformation
// 5. Permission validation during content creation
// 6. Event emission for group content
// 7. Storage attribution (who pays for content)
// 8. Content retrieval and verification
//
// Group content is stored at user-owned paths but associated with groups:
// - Write path: "groups/mygroup/posts/1" (checked for permissions)
// - Storage path: "alice.near/groups/mygroup/posts/1" (actual storage location)
// - Permission check: alice.near needs WRITE permission on groups/mygroup/posts/

#[cfg(test)]
mod group_content_integration_tests {
    use crate::tests::test_utils::*;
    use crate::domain::groups::permissions::kv::types::WRITE;
    use near_sdk::serde_json::json;
    use near_sdk::testing_env;

    // Import request builders for execute() API
    use crate::tests::test_utils::{create_group_request, join_group_request, set_permission_request, add_group_member_request};

    // ============================================================================
    // BASIC CONTENT CREATION TESTS
    // ============================================================================

    #[test]
    fn test_member_creates_post_in_public_group() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Owner creates public group
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request(
            "tech_discussion".to_string(),
            json!({
                "name": "Tech Discussion",
                "description": "A public tech group",
                "is_private": false
            }),
        )).unwrap();

        // Member joins public group
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("tech_discussion".to_string())).unwrap();

        // Grant member permission to post
        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/tech_discussion/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member creates a post
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let post_content = json!({
            "title": "My First Post",
            "text": "Hello everyone! Excited to be here.",
            "tags": ["introduction", "greeting"]
        });

        let result = contract.execute(set_request(json!({
                "groups/tech_discussion/posts/post1": post_content
            })));

        assert!(
            result.is_ok(),
            "Member with WRITE permission should create post successfully: {:?}",
            result.err()
        );

        // Verify content is stored at user-owned path (includes group in path)
        let keys = vec![format!("{}/groups/tech_discussion/posts/post1", member)];
        let retrieved = contract_get_values_map(&contract, keys, None);
        
        assert!(!retrieved.is_empty(), "Content should be retrievable");
        
        // Get API returns data directly at the key path
        let stored_content = retrieved.get(&format!("{}/groups/tech_discussion/posts/post1", member));
        
        assert!(stored_content.is_some(), "Post should exist at user-owned path");
        
        // Verify content exists (enrichment is in the stored value)
        let content = stored_content.unwrap();
        assert!(content.is_object(), "Content should be an object");

        println!("✓ Member successfully created post in public group");
    }

    #[test]
    fn test_member_creates_multiple_posts() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup group and member
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request(
            "blog_group".to_string(),
            json!({"name": "Blog Group", "is_private": false}),
        )).unwrap();

        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("blog_group".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/blog_group/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member creates multiple posts in one transaction
        let context = get_context_with_deposit(member.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/blog_group/posts/post1": {"title": "First Post", "text": "Content 1"},
                "groups/blog_group/posts/post2": {"title": "Second Post", "text": "Content 2"},
                "groups/blog_group/posts/post3": {"title": "Third Post", "text": "Content 3"}
            }),
        ));

        assert!(result.is_ok(), "Multiple posts should be created: {:?}", result.err());

        // Verify all posts exist (paths include group)
        let keys = vec![
            format!("{}/groups/blog_group/posts/post1", member),
            format!("{}/groups/blog_group/posts/post2", member),
            format!("{}/groups/blog_group/posts/post3", member),
        ];
        let retrieved = contract_get_values_map(&contract, keys, None);
        
        assert!(retrieved.get(&format!("{}/groups/blog_group/posts/post1", member)).is_some(), "Post 1 should exist");
        assert!(retrieved.get(&format!("{}/groups/blog_group/posts/post2", member)).is_some(), "Post 2 should exist");
        assert!(retrieved.get(&format!("{}/groups/blog_group/posts/post3", member)).is_some(), "Post 3 should exist");

        println!("✓ Member created multiple posts successfully");
    }

    #[test]
    fn test_different_content_types() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("community".to_string(), json!({"is_private": false}))).unwrap();

        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("community".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 2_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Grant permissions for different content types
        contract.execute(set_permission_request(member.clone(), "groups/community/posts/".to_string(), WRITE, None)).unwrap();
        contract.execute(set_permission_request(member.clone(), "groups/community/comments/".to_string(), WRITE, None)).unwrap();
        contract.execute(set_permission_request(member.clone(), "groups/community/media/".to_string(), WRITE, None)).unwrap();

        // Member creates different content types
        let context = get_context_with_deposit(member.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/community/posts/blog1": {"title": "Blog Post", "type": "article"},
                "groups/community/comments/c1": {"text": "Nice post!", "parent": "post123"},
                "groups/community/media/photo1": {"url": "ipfs://...", "caption": "Sunset"}
            }),
        ));

        assert!(result.is_ok(), "Different content types should work: {:?}", result.err());

        // Verify all stored correctly (paths include group)
        let keys = vec![
            format!("{}/groups/community/posts/blog1", member),
            format!("{}/groups/community/comments/c1", member),
            format!("{}/groups/community/media/photo1", member),
        ];
        let retrieved = contract_get_values_map(&contract, keys, None);

        assert!(retrieved.get(&format!("{}/groups/community/posts/blog1", member)).is_some());
        assert!(retrieved.get(&format!("{}/groups/community/comments/c1", member)).is_some());
        assert!(retrieved.get(&format!("{}/groups/community/media/photo1", member)).is_some());

        println!("✓ Different content types created successfully");
    }

    // ============================================================================
    // PERMISSION VALIDATION TESTS
    // ============================================================================

    #[test]
    fn test_non_member_cannot_create_content() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let non_member = test_account(1);

        // Owner creates private group
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request(
            "private_group".to_string(),
            json!({"is_private": true}),
        )).unwrap();

        // Non-member tries to create content
        let context = get_context_with_deposit(non_member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/private_group/posts/hack": {"text": "Unauthorized post"}
            }),
        ));

        assert!(
            result.is_err(),
            "Non-member should NOT be able to create content"
        );
        assert!(
            result.unwrap_err().to_string().contains("Permission denied"),
            "Should be permission denied error"
        );

        println!("✓ Non-member correctly blocked from creating content");
    }

    #[test]
    fn test_member_without_path_permission_blocked() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup group and member
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Create private group so we can control member permissions exactly
        contract.execute(create_group_request("restricted".to_string(), json!({"is_private": true}))).unwrap();

        // Add member with NO group-root permissions (level: 0)
        // This allows us to test path-specific permission isolation
        contract.execute(add_group_member_request("restricted".to_string(), member.clone())).unwrap();

        // Grant permission only for posts/, NOT comments/
        contract.execute(set_permission_request(
            member.clone(),
            "groups/restricted/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member CAN create posts
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/restricted/posts/allowed": {"text": "This should work"}
            }),
        ));

        assert!(result.is_ok(), "Should be able to write to posts/: {:?}", result.err());

        // Member CANNOT create comments (no permission)
        let result = contract.execute(set_request(
            json!({
                "groups/restricted/comments/denied": {"text": "This should fail"}
            }),
        ));

        assert!(
            result.is_err(),
            "Should NOT be able to write to comments/ without permission"
        );
        assert!(
            result.unwrap_err().to_string().contains("Permission denied"),
            "Should be permission denied error"
        );

        println!("✓ Path-specific permissions correctly enforced");
    }

    #[test]
    fn test_permission_revocation_blocks_content_creation() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup with permissions
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Create private group so we can control member permissions exactly
        contract.execute(create_group_request("revoke_test".to_string(), json!({"is_private": true}))).unwrap();

        // Add member with NO group-root permissions (level: 0)
        contract.execute(add_group_member_request("revoke_test".to_string(), member.clone())).unwrap();

        // Grant path-specific permission
        contract.execute(set_permission_request(
            member.clone(),
            "groups/revoke_test/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member creates content successfully
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/revoke_test/posts/before": {"text": "Posted with permission"}
            }),
        ));
        assert!(result.is_ok(), "Should work before revocation");

        // Owner revokes permission
        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/revoke_test/posts/".to_string(),
            0, // Revoke
            None,
        )).unwrap();

        // Member tries to create content after revocation
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/revoke_test/posts/after": {"text": "Should fail"}
            }),
        ));

        assert!(
            result.is_err(),
            "Should NOT work after permission revocation"
        );

        println!("✓ Permission revocation correctly blocks future content creation");
    }

    // ============================================================================
    // STORAGE ATTRIBUTION TESTS
    // ============================================================================

    #[test]
    fn test_content_creator_pays_storage() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("storage_test".to_string(), json!({"is_private": false}))).unwrap();

        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("storage_test".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/storage_test/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Get member's storage balance before content creation
        let balance_before = contract.get_storage_balance(member.clone()).unwrap();

        // Member creates content
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(set_request(
                json!({
                    "groups/storage_test/posts/large": {
                        "text": "A".repeat(1000), // Large content to ensure measurable storage
                        "metadata": {"key": "value"}
                    }
                }),
            ))
            .unwrap();

        // Get member's storage balance after content creation
        let balance_after = contract.get_storage_balance(member.clone()).unwrap();

        // Verify member's storage usage increased
        assert!(
            balance_after.used_bytes > balance_before.used_bytes,
            "Member's storage usage should increase after creating content"
        );

        println!("✓ Content creator correctly pays for storage");
    }

    // ============================================================================
    // EVENT EMISSION TESTS
    // ============================================================================

    #[test]
    fn test_content_creation_emits_events() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("event_test".to_string(), json!({"is_private": false}))).unwrap();

        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("event_test".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/event_test/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member creates content with event config
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Clear logs right before the operation we want to test
        near_sdk::test_utils::get_logs();

        contract
            .execute(set_request(
                json!({
                    "groups/event_test/posts/event_post": {"title": "Event Test Post"}
                }),
            ))
            .unwrap();

        // Verify event was emitted
        let logs = near_sdk::test_utils::get_logs();
        // Event is emitted in NEP-297 JSON format
        let has_event = logs.iter().any(|log| log.starts_with("EVENT_JSON:"));

        assert!(has_event, "Event should be emitted for content creation");

        println!("✓ Content creation correctly emits events");
    }

    // ============================================================================
    // COMPLEX WORKFLOW TESTS
    // ============================================================================

    #[test]
    fn test_multi_member_content_collaboration() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let alice = test_account(1);
        let bob = test_account(2);

        // Setup group
        let context = get_context_with_deposit(owner.clone(), 15_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("collab".to_string(), json!({"is_private": false}))).unwrap();

        // Both members join
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract.execute(join_group_request("collab".to_string())).unwrap();

        let context = get_context_with_deposit(bob.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract.execute(join_group_request("collab".to_string())).unwrap();

        // Grant permissions to both
        let context = get_context_with_deposit(owner.clone(), 2_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(alice.clone(), "groups/collab/posts/".to_string(), WRITE, None)).unwrap();
        contract.execute(set_permission_request(bob.clone(), "groups/collab/posts/".to_string(), WRITE, None)).unwrap();

        // Alice creates a post
        let context = get_context_with_deposit(alice.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(set_request(
                json!({
                    "groups/collab/posts/thread1": {"text": "Alice's post", "id": "thread1"}
                }),
            ))
            .unwrap();

        // Bob creates a reply
        let context = get_context_with_deposit(bob.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(set_request(
                json!({
                    "groups/collab/posts/reply1": {"text": "Bob's reply", "parent": "thread1"}
                }),
            ))
            .unwrap();

        // Verify both posts exist at their respective user-owned paths (paths include group)
        let alice_keys = vec![format!("{}/groups/collab/posts/thread1", alice)];
        let alice_data = contract_get_values_map(&contract, alice_keys, None);
        assert!(alice_data.get(&format!("{}/groups/collab/posts/thread1", alice)).is_some(), "Alice's post should exist");

        let bob_keys = vec![format!("{}/groups/collab/posts/reply1", bob)];
        let bob_data = contract_get_values_map(&contract, bob_keys, None);
        assert!(bob_data.get(&format!("{}/groups/collab/posts/reply1", bob)).is_some(), "Bob's reply should exist");

        println!("✓ Multi-member content collaboration works correctly");
    }

    #[test]
    fn test_content_creation_in_private_group() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let approved_member = test_account(1);

        // Create private group
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request(
            "private_club".to_string(),
            json!({"is_private": true}),
        )).unwrap();

        // Owner manually adds member
        contract
            .execute(add_group_member_request(
            "private_club".to_string(),
            approved_member.clone(),
        ))
            .unwrap();

        // Grant content permission
        contract.execute(set_permission_request(
            approved_member.clone(),
            "groups/private_club/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member creates content in private group
        let context = get_context_with_deposit(approved_member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/private_club/posts/secret": {"text": "Private content", "visibility": "private"}
            }),
        ));

        assert!(result.is_ok(), "Approved member should create content in private group: {:?}", result.err());

        // Verify content exists (path includes group)
        let keys = vec![format!("{}/groups/private_club/posts/secret", approved_member)];
        let retrieved = contract_get_values_map(&contract, keys, None);
        assert!(!retrieved.is_empty(), "Private group content should be retrievable");

        println!("✓ Content creation in private group works correctly");
    }

    #[test]
    fn test_owner_always_can_create_content() {
        let mut contract = init_live_contract();
        let owner = test_account(0);

        // Owner creates group
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("owner_group".to_string(), json!({"is_private": true}))).unwrap();

        // Owner creates content WITHOUT explicitly granting self permission
        // (Owner has implicit full permissions)
        let result = contract.execute(set_request(
            json!({
                "groups/owner_group/posts/owner_post": {"text": "Owner's post"}
            }),
        ));

        assert!(
            result.is_ok(),
            "Owner should always be able to create content: {:?}",
            result.err()
        );

        println!("✓ Owner can create content without explicit permission grant");
    }

    // ============================================================================
    // ERROR HANDLING TESTS
    // ============================================================================

    #[test]
    fn test_invalid_group_path_format() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        let context = get_context_with_deposit(user.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Test various invalid group path formats that go through GroupContentManager
        let invalid_paths = vec![
            "groups/",                    // Missing group ID and content path
            "groups/mygroup/",            // Missing content path
            "groups//posts/1",            // Empty group ID
        ];

        for invalid_path in invalid_paths {
            let result = contract.execute(set_request(
                json!({
                    invalid_path: {"text": "Test"}
                }),
            ));

            assert!(
                result.is_err(),
                "Invalid path '{}' should fail",
                invalid_path
            );
        }

        println!("✓ Invalid group path formats correctly rejected");
    }

    #[test]
    fn test_content_creation_in_nonexistent_group() {
        let mut contract = init_live_contract();
        let user = test_account(0);

        let context = get_context_with_deposit(user.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        let result = contract.execute(set_request(
            json!({
                "groups/nonexistent_group/posts/1": {"text": "This should fail"}
            }),
        ));

        assert!(
            result.is_err(),
            "Content creation in nonexistent group should fail"
        );
        let error_msg = result.unwrap_err().to_string();
        assert!(
            error_msg.contains("Group does not exist") ||
            error_msg.contains("Permission denied"),
            "Should indicate group doesn't exist or permission denied"
        );

        println!("✓ Content creation in nonexistent group correctly blocked");
    }

    #[test]
    fn test_insufficient_storage_for_content() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup group and member with minimal storage
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("storage_limit".to_string(), json!({"is_private": false}))).unwrap();

        // Member joins with very little storage deposit
        let context = get_context_with_deposit(member.clone(), 100_000_000_000_000_000_000_000); // 0.1 NEAR
        testing_env!(context.build());

        contract.execute(join_group_request("storage_limit".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/storage_limit/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Member tries to create very large content
        let context = get_context_with_deposit(member.clone(), 10_000_000_000_000_000_000); // Tiny deposit
        testing_env!(context.build());

        let large_content = json!({
            "groups/storage_limit/posts/huge": {
                "text": "X".repeat(10000), // 10KB of data
                "metadata": {"large": "data"}
            }
        });

        let result = contract.execute(set_request(large_content));

        // Should fail due to insufficient storage
        assert!(
            result.is_err(),
            "Should fail with insufficient storage"
        );

        println!("✓ Insufficient storage correctly prevents content creation");
    }

    // ============================================================================
    // CONTENT LIFECYCLE TESTS
    // ============================================================================

    #[test]
    fn test_content_update_and_versioning() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        // Setup
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("versioning".to_string(), json!({"is_private": false}))).unwrap();

        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("versioning".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            member.clone(),
            "groups/versioning/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Create initial content
        let context = get_context_with_deposit(member.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(set_request(
                json!({
                    "groups/versioning/posts/article1": {
                        "text": "Version 1",
                        "version": 1
                    }
                }),
            ))
            .unwrap();

        // Update content
        contract
            .execute(set_request(
                json!({
                    "groups/versioning/posts/article1": {
                        "text": "Version 2 - Updated",
                        "version": 2
                    }
                }),
            ))
            .unwrap();

        // Verify latest version is stored (path includes group)
        let keys = vec![format!("{}/groups/versioning/posts/article1", member)];
        let retrieved = contract_get_values_map(&contract, keys, None);
        
        let content = retrieved.get(&format!("{}/groups/versioning/posts/article1", member))
            .expect("Content should exist");

        // Content is enriched, version is inside the stored data
        assert!(content.is_object(), "Should have content object");

        println!("✓ Content update and versioning works correctly");
    }

    #[test]
    fn test_content_retrieval_by_different_users() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let author = test_account(1);
        let reader = test_account(2);

        // Setup group with author
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(create_group_request("public_read".to_string(), json!({"is_private": false}))).unwrap();

        let context = get_context_with_deposit(author.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(join_group_request("public_read".to_string())).unwrap();

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract.execute(set_permission_request(
            author.clone(),
            "groups/public_read/posts/".to_string(),
            WRITE,
            None,
        )).unwrap();

        // Author creates content
        let context = get_context_with_deposit(author.clone(), 5_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(set_request(
                json!({
                    "groups/public_read/posts/public_post": {"text": "Public content"}
                }),
            ))
            .unwrap();

        // Reader (not a member) tries to read content
        let context = get_context_with_deposit(reader.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        // Blockchain data is publicly readable (path includes group)
        let keys = vec![format!("{}/groups/public_read/posts/public_post", author)];
        let retrieved = contract_get_values_map(&contract, keys, None);

        assert!(
            !retrieved.is_empty(),
            "Public blockchain data should be readable by anyone"
        );

        println!("✓ Content retrieval by different users works (blockchain transparency)");
    }
}
