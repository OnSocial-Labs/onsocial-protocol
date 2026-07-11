#[cfg(test)]
mod group_space_post_policy_tests {
    use crate::Contract;
    use crate::domain::groups::permissions::kv::types::{MANAGE, MODERATE, WRITE};
    use crate::domain::groups::structure::{
        GuildStructure, PostPolicy, is_feed_post_content_path, is_space_write_capability_path,
        space_write_path,
    };
    use crate::tests::test_utils::*;
    use near_sdk::serde_json::json;
    use near_sdk::testing_env;

    fn sample_structure_config() -> near_sdk::serde_json::Value {
        json!({
            "x": {
                "onsocial": {
                    "structure": {
                        "v": 1,
                        "defaultSpaceId": "general",
                        "spaces": [
                            {
                                "id": "general",
                                "title": "General",
                                "kind": "discussion",
                                "enabled": true,
                                "order": 0,
                                "postPolicy": "members"
                            },
                            {
                                "id": "announcements",
                                "title": "Announcements",
                                "kind": "announcement",
                                "enabled": true,
                                "order": 1,
                                "postPolicy": "admins"
                            },
                            {
                                "id": "shipping-room",
                                "title": "Shipping",
                                "kind": "discussion",
                                "enabled": true,
                                "order": 2,
                                "postPolicy": "allowlist"
                            }
                        ]
                    }
                }
            }
        })
    }

    fn guild_structure_metadata() -> near_sdk::serde_json::Value {
        json!({
            "x": {
                "onsocial": {
                    "structure": {
                        "v": 1,
                        "defaultSpaceId": "general",
                        "spaces": [
                            {
                                "id": "general",
                                "title": "General",
                                "kind": "discussion",
                                "enabled": true,
                                "order": 0,
                                "audience": "members",
                                "postPolicy": "members"
                            },
                            {
                                "id": "announcements",
                                "title": "Announcements",
                                "kind": "announcement",
                                "enabled": true,
                                "order": 1,
                                "audience": "public",
                                "postPolicy": "admins"
                            },
                            {
                                "id": "updates",
                                "title": "Updates",
                                "kind": "discussion",
                                "enabled": true,
                                "order": 2,
                                "audience": "members",
                                "postPolicy": "moderators"
                            },
                            {
                                "id": "shipping-room",
                                "title": "Shipping",
                                "kind": "discussion",
                                "enabled": true,
                                "order": 3,
                                "audience": "members",
                                "postPolicy": "allowlist"
                            }
                        ]
                    }
                }
            }
        })
    }

    fn setup_group_with_structure(
        contract: &mut Contract,
        owner: &near_sdk::AccountId,
        group_id: &str,
    ) {
        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());

        contract
            .execute(create_group_request(
                group_id.to_string(),
                json!({ "name": "Policy Guild", "is_private": false }),
            ))
            .unwrap();

        contract
            .execute(update_group_metadata_request(
                group_id.to_string(),
                guild_structure_metadata(),
            ))
            .unwrap();
    }

    fn post_to_channel(
        contract: &mut Contract,
        author: &near_sdk::AccountId,
        group_id: &str,
        post_id: &str,
        channel: &str,
    ) -> Result<near_sdk::serde_json::Value, crate::SocialError> {
        let context = get_context_with_deposit(
            author.clone(),
            calculate_test_deposit_for_operations(1, 500),
        );
        testing_env!(context.build());

        contract.execute(set_request(json!({
            format!("groups/{}/content/post/{}", group_id, post_id): {
                "text": "hello",
                "channel": channel
            }
        })))
    }

    #[test]
    fn parses_structure_from_config_metadata() {
        let structure = GuildStructure::from_config(&sample_structure_config()).expect("structure");
        assert_eq!(structure.default_space_id, "general");
        assert_eq!(structure.spaces.len(), 3);
        assert_eq!(structure.spaces[1].post_policy, PostPolicy::Admins);
        assert_eq!(structure.spaces[2].post_policy, PostPolicy::Allowlist);
    }

    #[test]
    fn resolves_default_space_when_channel_missing() {
        let structure = GuildStructure::from_config(&sample_structure_config()).expect("structure");
        let space = structure
            .resolve_space_for_channel(None)
            .expect("default space");
        assert_eq!(space.id, "general");
    }

    #[test]
    fn resolves_legacy_decisions_channel() {
        let config = json!({
            "x": {
                "onsocial": {
                    "structure": {
                        "v": 1,
                        "defaultSpaceId": "general",
                        "spaces": [{
                            "id": "decisions",
                            "title": "Decisions",
                            "kind": "proposal",
                            "enabled": true,
                            "order": 0,
                            "postPolicy": "members"
                        }]
                    }
                }
            }
        });
        let structure = GuildStructure::from_config(&config).expect("structure");
        let space = structure
            .resolve_space_for_channel(Some("proposals"))
            .expect("decisions");
        assert_eq!(space.id, "decisions");
    }

    #[test]
    fn detects_feed_post_paths_and_space_write_path() {
        assert!(is_feed_post_content_path("content/post/p1"));
        assert!(!is_feed_post_content_path("content/resources/r1"));
        assert_eq!(
            space_write_path("policy_guild", "shipping-room"),
            "groups/policy_guild/spaces/shipping-room/write"
        );
        assert!(is_space_write_capability_path(
            "groups/policy_guild/spaces/shipping-room/write"
        ));
        assert!(!is_space_write_capability_path(
            "groups/policy_guild/spaces/shipping-room"
        ));
    }

    #[test]
    fn member_can_post_to_members_space() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let result = post_to_channel(&mut contract, &member, "policy_guild", "g1", "general");
        assert!(
            result.is_ok(),
            "member should post to general: {:?}",
            result.err()
        );
    }

    #[test]
    fn member_blocked_from_admins_space() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let result = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ann1",
            "announcements",
        );
        assert!(result.is_err(), "member should not post to announcements");
        assert!(
            result
                .unwrap_err()
                .to_string()
                .contains("Permission denied"),
            "expected permission denied"
        );
    }

    #[test]
    fn admin_can_post_to_admins_space() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &admin, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                admin.clone(),
                "groups/policy_guild/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();

        let result = post_to_channel(
            &mut contract,
            &admin,
            "policy_guild",
            "ann1",
            "announcements",
        );
        assert!(
            result.is_ok(),
            "admin should post to announcements: {:?}",
            result.err()
        );
    }

    #[test]
    fn moderator_can_post_to_moderators_space() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &moderator, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                moderator.clone(),
                "groups/policy_guild/config".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        let result = post_to_channel(&mut contract, &moderator, "policy_guild", "up1", "updates");
        assert!(
            result.is_ok(),
            "moderator should post to updates: {:?}",
            result.err()
        );
    }

    #[test]
    fn allowlist_space_requires_space_write_grant() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let blocked = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            blocked.is_err(),
            "member should not post without space write grant"
        );

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                member.clone(),
                space_write_path("policy_guild", "shipping-room"),
                WRITE,
                None,
            ))
            .unwrap();

        let allowed = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            allowed.is_ok(),
            "member with space write grant should post: {:?}",
            allowed.err()
        );
    }

    #[test]
    fn allowlist_space_allows_admin_without_grant() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &admin, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                admin.clone(),
                "groups/policy_guild/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();

        let result = post_to_channel(
            &mut contract,
            &admin,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            result.is_ok(),
            "admin should post to allowlist space without grant: {:?}",
            result.err()
        );
    }

    #[test]
    fn allowlist_space_blocks_moderator_without_grant() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &moderator, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                moderator.clone(),
                "groups/policy_guild/config".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        let result = post_to_channel(
            &mut contract,
            &moderator,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            result.is_err(),
            "moderator should not post to allowlist space without grant"
        );
    }

    #[test]
    fn guild_admin_can_grant_allowlist_space_write() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin = test_account(1);
        let member = test_account(2);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &admin, WRITE, &owner);
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                admin.clone(),
                "groups/policy_guild/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();

        // Member cannot post yet.
        let blocked = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(blocked.is_err(), "member should be blocked before grant");

        // Guild admin grants allowlist WRITE.
        let context = get_context_with_deposit(admin.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_request(json!({"storage/deposit": {"amount": "1"}})))
            .unwrap();
        let grant = contract.execute_admin(set_permission_request(
            member.clone(),
            space_write_path("policy_guild", "shipping-room"),
            WRITE,
            None,
        ));
        assert!(
            grant.is_ok(),
            "guild admin should grant space write: {:?}",
            grant.err()
        );

        let allowed = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            allowed.is_ok(),
            "member should post after admin allowlist grant: {:?}",
            allowed.err()
        );
    }

    #[test]
    fn room_lead_grant_can_be_overridden_by_guild_admin() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let admin = test_account(1);
        let room_lead = test_account(2);
        let member = test_account(3);
        let space_path = space_write_path("policy_guild", "shipping-room");

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &admin, WRITE, &owner);
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &room_lead, WRITE, &owner);
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 2_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        // Guild admin (config MANAGE).
        contract
            .execute_admin(set_permission_request(
                admin.clone(),
                "groups/policy_guild/config".to_string(),
                MANAGE,
                None,
            ))
            .unwrap();
        // Room lead: path MANAGE on this space write capability only.
        contract
            .execute_admin(set_permission_request(
                room_lead.clone(),
                space_path.clone(),
                MANAGE,
                None,
            ))
            .unwrap();

        // Room lead adds member to allowlist.
        let context =
            get_context_with_deposit(room_lead.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_request(json!({"storage/deposit": {"amount": "1"}})))
            .unwrap();
        let lead_grant = contract.execute_admin(set_permission_request(
            member.clone(),
            space_path.clone(),
            WRITE,
            None,
        ));
        assert!(
            lead_grant.is_ok(),
            "room lead should grant space write: {:?}",
            lead_grant.err()
        );

        let after_lead = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship1",
            "shipping-room",
        );
        assert!(
            after_lead.is_ok(),
            "member should post after room-lead grant: {:?}",
            after_lead.err()
        );

        // Guild admin overrides: revoke member write.
        let context = get_context_with_deposit(admin.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_request(json!({"storage/deposit": {"amount": "1"}})))
            .unwrap();
        let admin_revoke = contract.execute_admin(set_permission_request(
            member.clone(),
            space_path.clone(),
            0,
            None,
        ));
        assert!(
            admin_revoke.is_ok(),
            "guild admin should revoke space write: {:?}",
            admin_revoke.err()
        );

        let after_revoke = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship2",
            "shipping-room",
        );
        assert!(
            after_revoke.is_err(),
            "member should be blocked after guild-admin revoke"
        );

        // Guild admin can re-add the member.
        let context = get_context_with_deposit(admin.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        let admin_regrant = contract.execute_admin(set_permission_request(
            member.clone(),
            space_path,
            WRITE,
            None,
        ));
        assert!(
            admin_regrant.is_ok(),
            "guild admin should re-grant space write: {:?}",
            admin_regrant.err()
        );

        let after_regrant = post_to_channel(
            &mut contract,
            &member,
            "policy_guild",
            "ship3",
            "shipping-room",
        );
        assert!(
            after_regrant.is_ok(),
            "member should post after guild-admin re-grant: {:?}",
            after_regrant.err()
        );
    }

    #[test]
    fn moderator_cannot_grant_allowlist_space_write() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let moderator = test_account(1);
        let member = test_account(2);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &moderator, WRITE, &owner);
        test_add_member_bypass_proposals(&mut contract, "policy_guild", &member, WRITE, &owner);

        let context = get_context_with_deposit(owner.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute_admin(set_permission_request(
                moderator.clone(),
                "groups/policy_guild/config".to_string(),
                MODERATE,
                None,
            ))
            .unwrap();

        let context =
            get_context_with_deposit(moderator.clone(), 1_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        let grant = contract.execute_admin(set_permission_request(
            member.clone(),
            space_write_path("policy_guild", "shipping-room"),
            WRITE,
            None,
        ));
        assert!(
            grant.is_err(),
            "moderator should not grant allowlist space write"
        );
    }

    #[test]
    fn owner_can_post_to_any_space() {
        let mut contract = init_live_contract();
        let owner = test_account(0);

        setup_group_with_structure(&mut contract, &owner, "policy_guild");

        let result = post_to_channel(
            &mut contract,
            &owner,
            "policy_guild",
            "ann1",
            "announcements",
        );
        assert!(
            result.is_ok(),
            "owner should post anywhere: {:?}",
            result.err()
        );
    }

    #[test]
    fn groups_without_structure_remain_backward_compatible() {
        let mut contract = init_live_contract();
        let owner = test_account(0);
        let member = test_account(1);

        let context = get_context_with_deposit(owner.clone(), 10_000_000_000_000_000_000_000_000);
        testing_env!(context.build());
        contract
            .execute(create_group_request(
                "legacy_guild".to_string(),
                json!({ "name": "Legacy Guild", "is_private": false }),
            ))
            .unwrap();

        test_add_member_bypass_proposals(&mut contract, "legacy_guild", &member, WRITE, &owner);

        let result = post_to_channel(
            &mut contract,
            &member,
            "legacy_guild",
            "p1",
            "anything-goes",
        );
        assert!(
            result.is_ok(),
            "legacy groups without structure should still allow member posts: {:?}",
            result.err()
        );
    }
}
