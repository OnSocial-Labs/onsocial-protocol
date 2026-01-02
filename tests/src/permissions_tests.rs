// =============================================================================
// KV Permissions (Account + Group) Integration Tests
// =============================================================================
// Covers hierarchical permission inheritance, trailing-slash equivalence, and
// group-specific permission delegation rules.
//
// Run with:
//   cargo test -p onsocial-integration-tests permissions_tests -- --test-threads=1

use near_workspaces::types::NearToken;
use near_workspaces::{Account, Contract};
use serde_json::json;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

const WRITE: u8 = 1;
const MODERATE: u8 = 2;
const MANAGE: u8 = 3;

async fn now_nanos(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<u64> {
    Ok(worker.view_block().await?.timestamp())
}

async fn propose_and_approve(
    contract: &Contract,
    group_id: &str,
    proposer: &Account,
    proposal_type: &str,
    changes: serde_json::Value,
    extra_yes_voters: &[&Account],
) -> anyhow::Result<String> {
    let res = proposer
        .call(contract.id(), "create_group_proposal")
        .args_json(json!({
            "group_id": group_id,
            "proposal_type": proposal_type,
            "changes": changes,
            "event_config": null,
            "auto_vote": null
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(180))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "create_group_proposal should succeed: {:?}",
        res.failures()
    );
    let proposal_id: String = res.json()?;

    for voter in extra_yes_voters {
        let vote = voter
            .call(contract.id(), "vote_on_proposal")
            .args_json(json!({
                "group_id": group_id,
                "proposal_id": proposal_id,
                "approve": true,
                "event_config": null
            }))
            .deposit(ONE_NEAR)
            .gas(near_workspaces::types::Gas::from_tgas(160))
            .transact()
            .await?;
        assert!(vote.is_success(), "vote_on_proposal should succeed: {:?}", vote.failures());
    }

    Ok(proposal_id)
}

fn load_core_onsocial_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ];

    for path in paths {
        if let Ok(wasm) = std::fs::read(std::path::Path::new(path)) {
            return Ok(wasm);
        }
    }

    Err(anyhow::anyhow!("Could not find core_onsocial.wasm"))
}

async fn deploy_and_init(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<Contract> {
    let wasm = load_core_onsocial_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;

    contract
        .call("new")
        .args_json(json!({}))
        .transact()
        .await?
        .into_result()?;
    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?)
}

async fn deposit_storage(contract: &Contract, user: &Account, amount: NearToken) -> anyhow::Result<()> {
    let yocto = amount.as_yoctonear().to_string();
    let res = user
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "storage/deposit": { "amount": yocto }
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(amount)
        .gas(near_workspaces::types::Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(res.is_success(), "storage/deposit should succeed: {:?}", res.failures());
    Ok(())
}

async fn create_group(contract: &Contract, owner: &Account, group_id: &str) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": group_id,
            "config": { "is_private": false }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "create_group should succeed: {:?}", res.failures());
    Ok(())
}

async fn create_member_driven_group(
    contract: &Contract,
    owner: &Account,
    group_id: &str,
) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "create_group")
        .args_json(json!({
            "group_id": group_id,
            "config": {
                "is_private": true,
                "member_driven": true
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "create_member_driven_group should succeed: {:?}",
        res.failures()
    );
    Ok(())
}

async fn add_member(contract: &Contract, owner: &Account, group_id: &str, member: &Account) -> anyhow::Result<()> {
    let res = owner
        .call(contract.id(), "add_group_member")
        .args_json(json!({
            "group_id": group_id,
            "member_id": member.id(),
            "level": 0
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "add_group_member should succeed: {:?}", res.failures());
    Ok(())
}

#[tokio::test]
async fn test_account_permission_inheritance_and_trailing_slash_equivalence() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    let delegated_dir = format!("{}/delegated/", alice.id());
    let delegated_no_slash = format!("{}/delegated", alice.id());

    // Grant with trailing slash.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": delegated_dir,
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(90))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission should succeed: {:?}", res.failures());

    // Trailing-slash equivalence: permission stored at .../delegated/ must apply to .../delegated.
    let has_on_no_slash: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": delegated_no_slash,
            "level": WRITE
        }))
        .await?
        .json()?;
    assert!(has_on_no_slash, "expected .../delegated/ to authorize .../delegated");

    // Inheritance: permission on .../delegated/ must allow cross-account set at deeper paths.
    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": { "delegated/message": "hello" },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "cross-account set should succeed with delegated permission: {:?}", res.failures());

    // Revoke and verify denial.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/delegated/", alice.id()),
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(90))
        .transact()
        .await?;
    assert!(res.is_success(), "revoke should succeed: {:?}", res.failures());

    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": { "delegated/message": "should fail" },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "cross-account set should fail after revoke");

    Ok(())
}

#[tokio::test]
async fn test_group_permission_delegation_and_membership_gating() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;

    // A non-member (will receive a permission entry, but should still not be authorized).
    let dave = worker.dev_create_account().await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;
    // Bob needs storage balance to write the permission entry when delegating.
    deposit_storage(&contract, &bob, ONE_NEAR).await?;

    create_group(&contract, &alice, "devs").await?;
    add_member(&contract, &alice, "devs", &bob).await?;
    add_member(&contract, &alice, "devs", &carol).await?;

    // Members get default WRITE on groups/{id}/content at join time.
    // So delegation tests should use a higher required level.
    let carol_has_moderate_before: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/devs/content/posts/hello",
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert!(
        !carol_has_moderate_before,
        "Carol should NOT have MODERATE by default (only WRITE on /content)"
    );

    // Owner grants MANAGE on a subtree to Bob.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/devs/content",
            "level": MANAGE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(110))
        .transact()
        .await?;
    assert!(res.is_success(), "owner set_permission(MANAGE) should succeed: {:?}", res.failures());

    // Bob delegates MODERATE downwards to Carol.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/devs/content/posts/",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(110))
        .transact()
        .await?;
    assert!(res.is_success(), "manage delegation should allow downward grant: {:?}", res.failures());

    // Carol must now be authorized for MODERATE; use an owner-prefixed path to exercise group root detection.
    let carol_has: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": format!("{}/groups/devs/content/posts/hello", alice.id()),
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert!(carol_has, "expected delegated group permission to apply");

    // Explicit equivalence: owner-prefixed and plain group paths must match.
    let carol_has_plain: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/devs/content/posts/hello",
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert_eq!(
        carol_has_plain, carol_has,
        "owner-prefixed and plain group paths must produce same answer"
    );

    // Membership gating: once removed from the group, Carol must lose group-scoped permissions
    // immediately (even if a permission entry still exists in storage).
    let remove_carol = alice
        .call(contract.id(), "remove_group_member")
        .args_json(json!({
            "group_id": "devs",
            "member_id": carol.id()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        remove_carol.is_success(),
        "remove_group_member should succeed: {:?}",
        remove_carol.failures()
    );

    let carol_has_after_removal: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/devs/content/posts/hello",
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert!(
        !carol_has_after_removal,
        "removed member must not retain group permissions"
    );

    let carol_has_after_removal_prefixed: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": format!("{}/groups/devs/content/posts/hello", alice.id()),
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert!(
        !carol_has_after_removal_prefixed,
        "removed member must not retain group permissions (owner-prefixed form)"
    );

    // Non-member gating: group permissions cannot be granted to non-members.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": dave.id(),
            "path": "groups/devs/content/",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(110))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "setting group permissions for non-member must fail: {:?}",
        res.failures()
    );

    let dave_has: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": dave.id(),
            "path": "groups/devs/content/posts/hello",
            "level": MODERATE
        }))
        .await?
        .json()?;
    assert!(!dave_has, "non-member must not be authorized");

    // Bob cannot delegate MANAGE (explicitly forbidden).
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/devs/content/posts/",
            "level": MANAGE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(110))
        .transact()
        .await?;
    assert!(!res.is_success(), "manage delegation must not allow granting MANAGE");

    // Bob cannot set permissions at the group root without being owner.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/devs/",
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(110))
        .transact()
        .await?;
    assert!(!res.is_success(), "non-owner must not set group-root permissions");

    Ok(())
}

#[tokio::test]
async fn test_member_driven_groups_reject_direct_permission_changes() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    create_member_driven_group(&contract, &alice, "md").await?;

    // Owner direct permission changes are rejected (member-driven groups require proposals).
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/md/content/posts/",
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "member-driven owner set_permission should fail (should use proposals)"
    );
    let owner_failures = format!("{:?}", res.failures());
    assert!(
        owner_failures.contains("Member-driven groups require governance proposals"),
        "expected governance/proposal failure, got: {owner_failures}"
    );

    // Non-owner direct permission changes should also fail (unauthorized).
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/md/content/posts/",
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "non-owner set_permission should fail for member-driven groups"
    );
    let non_owner_failures = format!("{:?}", res.failures());
    assert!(
        non_owner_failures.contains("Member-driven groups require governance proposals")
            || non_owner_failures.contains("Unauthorized")
            || non_owner_failures.contains("unauthorized"),
        "expected governance/proposal or unauthorized failure, got: {non_owner_failures}"
    );

    Ok(())
}

#[tokio::test]
async fn test_group_permission_expiration_on_non_default_path() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "expiry").await?;
    add_member(&contract, &alice, "expiry", &bob).await?;

    // Use a non-default path (members only get default WRITE on groups/{id}/content).
    let path = "groups/expiry/private/";

    let now = now_nanos(&worker).await?;
    let past = now.saturating_sub(1_000_000_000);

    // Grant expired WRITE.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": path,
            "level": WRITE,
            "expires_at": past.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission(expired) should succeed: {:?}", res.failures());

    let has_expired: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": path,
            "level": WRITE
        }))
        .await?
        .json()?;
    assert!(!has_expired, "expired permission must not be effective");

    // Attempt write (should fail).
    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "groups/expiry/private/test": {"x": 1}
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(!res.is_success(), "write should fail with expired permission");

    // Grant valid WRITE.
    let future = now.saturating_add(3_600_000_000_000);
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": path,
            "level": WRITE,
            "expires_at": future.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission(valid) should succeed: {:?}", res.failures());

    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "data": {
                    "groups/expiry/private/test": {"x": 2}
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "write should succeed with valid permission: {:?}", res.failures());

    Ok(())
}

#[tokio::test]
async fn test_key_permission_does_not_bypass_group_membership() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // A relayer account that is NOT a group member.
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "keygrp").await?;

    // Alice grants key permission to relayer for a group path.
    // This will write an entry under alice's key_permissions namespace, but group writes
    // are validated using membership + account-based permissions only.
    let relayer_pk = relayer.secret_key().public_key();
    let res = alice
        .call(contract.id(), "set_key_permission")
        .args_json(json!({
            "public_key": relayer_pk,
            "path": "groups/keygrp/content/",
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "set_key_permission should succeed: {:?}", res.failures());

    // Relayer tries to write group content via cross-account set (should still fail: not a member).
    let res = relayer
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": {
                    "groups/keygrp/content/posts/hello": {"t": "nope"}
                },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(160))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "key permissions must not bypass group membership"
    );

    Ok(())
}

#[tokio::test]
async fn test_member_driven_manage_delegation_exception_rules() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;
    let dave = worker.dev_create_account().await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;
    deposit_storage(&contract, &bob, ONE_NEAR).await?;

    create_member_driven_group(&contract, &alice, "md2").await?;

    // Add Bob + Carol via proposals (auto_vote by proposer + explicit yes votes to ensure execution).
    let _invite_bob = propose_and_approve(
        &contract,
        "md2",
        &alice,
        "member_invite",
        json!({
            "target_user": bob.id(),
            "level": 0,
            "message": "invite bob"
        }),
        &[],
    )
    .await?;
    let is_bob_member: bool = contract
        .view("is_group_member")
        .args_json(json!({"group_id": "md2", "member_id": bob.id()}))
        .await?
        .json()?;
    assert!(is_bob_member, "Bob should be a member after invite proposal");

    let invite_carol = propose_and_approve(
        &contract,
        "md2",
        &alice,
        "member_invite",
        json!({
            "target_user": carol.id(),
            "level": 0,
            "message": "invite carol"
        }),
        &[&bob],
    )
    .await?;
    let _ = invite_carol;
    let is_carol_member: bool = contract
        .view("is_group_member")
        .args_json(json!({"group_id": "md2", "member_id": carol.id()}))
        .await?
        .json()?;
    assert!(is_carol_member, "Carol should be a member after invite proposal");

    // Grant Bob MANAGE at group root via PermissionChange proposal.
    let _perm_bob_manage = propose_and_approve(
        &contract,
        "md2",
        &alice,
        "permission_change",
        json!({
            "target_user": bob.id(),
            "level": MANAGE,
            "reason": "grant manage"
        }),
        &[&bob],
    )
    .await?;

    // Bob tries to delegate WRITE downwards WITHOUT expires_at -> must fail.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/md2/content/posts/",
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "member-driven delegated grants must require expires_at"
    );

    // Bob tries to delegate to a non-member even WITH expires_at -> must fail.
    let future = now_nanos(&worker).await?.saturating_add(3_600_000_000_000);
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": dave.id(),
            "path": "groups/md2/content/posts/",
            "level": WRITE,
            "expires_at": future.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "delegated grants in member-driven groups must be limited to existing members"
    );

    // Bob delegates WRITE downwards WITH expires_at -> should succeed.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/md2/content/posts/",
            "level": WRITE,
            "expires_at": future.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "delegated grant should succeed: {:?}", res.failures());

    let carol_can_write: bool = contract
        .view("has_permission")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/md2/content/posts/hello",
            "level": WRITE
        }))
        .await?
        .json()?;
    assert!(carol_can_write, "delegated WRITE should be effective");

    // Disallowed: delegation on group root.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/md2/",
            "level": WRITE,
            "expires_at": future.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(!res.is_success(), "member-driven groups must reject delegation at group root");

    // Disallowed: delegation on group config.
    let res = bob
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/md2/config/",
            "level": WRITE,
            "expires_at": future.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(!res.is_success(), "member-driven groups must reject delegation on group config");

    Ok(())
}

/// Tests `get_permissions` view for group paths including:
/// - Owner returns FULL_ACCESS (255)
/// - Member with explicit grant returns that level
/// - Removed member returns 0
/// - Owner param is ignored for group paths (path determines ownership)
#[tokio::test]
async fn test_get_permissions_group_path_semantics() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "gperms").await?;
    add_member(&contract, &alice, "gperms", &bob).await?;
    add_member(&contract, &alice, "gperms", &carol).await?;

    // 1. Owner returns FULL_ACCESS (255) regardless of explicit grants.
    let owner_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": alice.id(),
            "path": "groups/gperms/content/posts"
        }))
        .await?
        .json()?;
    assert_eq!(owner_level, 255, "owner must get FULL_ACCESS");

    // 2. Grant MODERATE to Bob, verify get_permissions returns 2.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/gperms/content/",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant MODERATE to Bob should succeed: {:?}", res.failures());

    let bob_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/gperms/content/posts/hello"
        }))
        .await?
        .json()?;
    assert_eq!(bob_level, MODERATE, "Bob must have MODERATE after grant");

    // 3. Owner param is ignored for group paths: use wrong owner, same result.
    let bob_level_wrong_owner: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": bob.id(),
            "grantee": bob.id(),
            "path": "groups/gperms/content/posts/hello"
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_level_wrong_owner, bob_level,
        "owner param must be ignored for group paths"
    );

    // 4. Removed member returns 0.
    let remove_bob = alice
        .call(contract.id(), "remove_group_member")
        .args_json(json!({
            "group_id": "gperms",
            "member_id": bob.id()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(remove_bob.is_success(), "remove_group_member should succeed: {:?}", remove_bob.failures());

    let bob_level_after_remove: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/gperms/content/posts/hello"
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_after_remove, 0, "removed member must get 0");

    // 5. Carol (still member but no explicit grant beyond default) should return her default level.
    // Members get WRITE on groups/{id}/content at join; verify that path hierarchy applies.
    let carol_level_content: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/gperms/content/posts/hello"
        }))
        .await?
        .json()?;
    assert_eq!(carol_level_content, WRITE, "member default grant on /content should apply to subpaths");

    // 6. Carol has no permission on private namespace (no grant there).
    let carol_level_private: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/gperms/private/secret"
        }))
        .await?
        .json()?;
    assert_eq!(carol_level_private, 0, "member without grant on namespace should get 0");

    // 7. Expired grant returns 0 via get_permissions.
    let now = now_nanos(&worker).await?;
    let past = now.saturating_sub(1_000_000_000);
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/gperms/private/",
            "level": MODERATE,
            "expires_at": past.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant expired permission should succeed: {:?}", res.failures());

    let carol_level_expired: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": carol.id(),
            "path": "groups/gperms/private/secret"
        }))
        .await?
        .json()?;
    assert_eq!(carol_level_expired, 0, "expired grant must return 0 via get_permissions");

    Ok(())
}

/// Tests account permission hierarchy walk:
/// - Parent path grants apply to child paths
/// - get_permissions returns correct level via hierarchy
#[tokio::test]
async fn test_account_permission_hierarchy_walk() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // Grant WRITE at alice/docs/
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/docs/", alice.id()),
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "grant should succeed: {:?}", res.failures());

    // Check Bob has WRITE at deeper paths.
    let bob_level_deep: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/docs/a/b/c/file.txt", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_deep, WRITE, "permission at parent must apply to deep children");

    // Bob has no permission on sibling path.
    let bob_level_sibling: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/images/photo.png", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_sibling, 0, "permission on /docs must not apply to /images");

    // Cross-account write must succeed at child path.
    let res = bob
        .call(contract.id(), "set")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "data": { "docs/deeply/nested/file": "content" },
                "options": null,
                "event_config": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(near_workspaces::types::Gas::from_tgas(140))
        .transact()
        .await?;
    assert!(res.is_success(), "cross-account set at child path should succeed: {:?}", res.failures());

    Ok(())
}

/// Tests that rejoin increments nonce, invalidating old permissions.
/// Member leaves, rejoins with new nonce, old permission grants no longer apply.
#[tokio::test]
async fn test_group_rejoin_nonce_invalidates_old_permissions() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "nonce").await?;
    add_member(&contract, &alice, "nonce", &bob).await?;

    // Grant Bob MODERATE on a non-default path.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/nonce/private/",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant should succeed: {:?}", res.failures());

    // Verify Bob has MODERATE.
    let bob_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/nonce/private/secret"
        }))
        .await?
        .json()?;
    assert_eq!(bob_level, MODERATE, "Bob should have MODERATE before leave");

    // Remove Bob.
    let res = alice
        .call(contract.id(), "remove_group_member")
        .args_json(json!({
            "group_id": "nonce",
            "member_id": bob.id()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "remove should succeed: {:?}", res.failures());

    // Bob has no permission after removal.
    let bob_level_removed: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/nonce/private/secret"
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_removed, 0, "removed member must have 0 permissions");

    // Re-add Bob (nonce increments).
    add_member(&contract, &alice, "nonce", &bob).await?;

    // Old permission (stored with old nonce) must NOT apply.
    let bob_level_rejoined: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/nonce/private/secret"
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_level_rejoined, 0,
        "rejoined member must NOT inherit old permissions (nonce mismatch)"
    );

    // Bob only has default WRITE on /content (from new membership).
    let bob_content_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": "groups/nonce/content/posts"
        }))
        .await?
        .json()?;
    assert_eq!(bob_content_level, WRITE, "rejoined member should have default WRITE on /content");

    Ok(())
}

/// Tests revoking a permission that doesn't exist succeeds silently.
#[tokio::test]
async fn test_revoke_nonexistent_permission_succeeds() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // Bob has no permission on alice/random.
    let bob_level_before: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/random/path", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_before, 0, "Bob should have no permission initially");

    // Revoke non-existent permission (level=0).
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/random/path", alice.id()),
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "revoke of non-existent permission should succeed: {:?}", res.failures());

    // Permission still 0.
    let bob_level_after: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/random/path", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_after, 0, "Bob should still have no permission");

    Ok(())
}

/// Tests that invalid permission levels are rejected.
#[tokio::test]
async fn test_invalid_permission_level_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // Try invalid level (e.g., 99).
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/test/", alice.id()),
            "level": 99,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!res.is_success(), "invalid permission level should be rejected");
    let failure = format!("{:?}", res.failures());
    assert!(
        failure.contains("Invalid permission level"),
        "expected 'Invalid permission level' error, got: {failure}"
    );

    // Try level 4 (not valid: only 0,1,2,3 are valid).
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/test/", alice.id()),
            "level": 4,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(!res.is_success(), "level 4 should be rejected");

    Ok(())
}

/// Tests that group permission events include permission_nonce field.
/// Critical for indexers to track valid permission grants per membership period.
#[tokio::test]
async fn test_group_permission_events_include_nonce() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "evtgrp").await?;
    add_member(&contract, &alice, "evtgrp", &bob).await?;

    // Grant permission on group path.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/evtgrp/private/",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant should succeed: {:?}", res.failures());

    // Find PERMISSION_UPDATE grant event.
    let logs = res.logs();
    let grant_event = logs.iter()
        .find(|log| log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"grant\""))
        .expect("should emit PERMISSION_UPDATE grant event");

    // Parse and verify permission_nonce is present.
    let event_json = grant_event
        .strip_prefix("EVENT_JSON:")
        .expect("event should have EVENT_JSON prefix");
    let event: serde_json::Value = serde_json::from_str(event_json)?;
    
    // extra fields are flattened into data[0], not nested under "extra"
    let event_data = &event["data"][0];
    assert!(
        event_data["permission_nonce"].is_number() || event_data["permission_nonce"].is_string(),
        "group permission grant event must include permission_nonce, got: {event_data}"
    );

    // Revoke and verify nonce in revoke event.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/evtgrp/private/",
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "revoke should succeed: {:?}", res.failures());

    let logs = res.logs();
    let revoke_event = logs.iter()
        .find(|log| log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"revoke\""))
        .expect("should emit PERMISSION_UPDATE revoke event");

    let event_json = revoke_event
        .strip_prefix("EVENT_JSON:")
        .expect("event should have EVENT_JSON prefix");
    let event: serde_json::Value = serde_json::from_str(event_json)?;
    
    // extra fields are flattened into data[0]
    let event_data = &event["data"][0];
    assert!(
        event_data["permission_nonce"].is_number() || event_data["permission_nonce"].is_string(),
        "group permission revoke event must include permission_nonce, got: {event_data}"
    );
    assert!(
        event_data["deleted"].as_bool() == Some(true),
        "revoke event should have deleted=true, got: {event_data}"
    );

    // Verify account-scoped permissions do NOT include permission_nonce.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": format!("{}/docs/", alice.id()),
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "account grant should succeed: {:?}", res.failures());

    let logs = res.logs();
    let account_event = logs.iter()
        .find(|log| log.contains("PERMISSION_UPDATE") && log.contains("\"operation\":\"grant\""))
        .expect("should emit PERMISSION_UPDATE grant event for account path");

    let event_json = account_event
        .strip_prefix("EVENT_JSON:")
        .expect("event should have EVENT_JSON prefix");
    let event: serde_json::Value = serde_json::from_str(event_json)?;
    
    // extra fields are flattened into data[0]
    let event_data = &event["data"][0];
    assert!(
        event_data.get("permission_nonce").is_none() || event_data["permission_nonce"].is_null(),
        "account permission event must NOT include permission_nonce, got: {event_data}"
    );

    Ok(())
}

/// Tests that group permission keys are format-consistent across path variants.
/// Grant via owner-prefixed path, lookup via direct path (and vice versa).
/// Exercises `build_group_permission_key` dual-format path normalization.
#[tokio::test]
async fn test_group_permission_key_format_consistency_across_path_variants() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    create_group(&contract, &alice, "keyfmt").await?;
    add_member(&contract, &alice, "keyfmt", &bob).await?;

    // --- Scenario 1: Grant via OWNER-PREFIXED path, lookup via DIRECT path ---
    let owner_prefixed_path = format!("{}/groups/keyfmt/private/docs/", alice.id());
    let direct_path = "groups/keyfmt/private/docs/";

    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": owner_prefixed_path,
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant via owner-prefixed path should succeed: {:?}", res.failures());

    // Lookup via direct path must find the permission.
    let bob_level_direct: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": direct_path
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_level_direct, MODERATE,
        "permission granted via owner-prefixed path must be found via direct path"
    );

    // Lookup via owner-prefixed path must also find it.
    let bob_level_prefixed: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": owner_prefixed_path
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_level_prefixed, MODERATE,
        "permission granted via owner-prefixed path must be found via same path"
    );

    // Revoke to reset.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": direct_path,
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "revoke should succeed: {:?}", res.failures());

    // Verify revoked.
    let bob_level_after_revoke: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": direct_path
        }))
        .await?
        .json()?;
    assert_eq!(bob_level_after_revoke, 0, "permission should be revoked");

    // --- Scenario 2: Grant via DIRECT path, lookup via OWNER-PREFIXED path ---
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": direct_path,
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "grant via direct path should succeed: {:?}", res.failures());

    // Lookup via owner-prefixed path must find it.
    let bob_level_via_prefixed: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": owner_prefixed_path
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_level_via_prefixed, WRITE,
        "permission granted via direct path must be found via owner-prefixed path"
    );

    // --- Scenario 3: Deep subpath consistency ---
    let deep_subpath_direct = "groups/keyfmt/private/docs/nested/file.txt";
    let deep_subpath_prefixed = format!("{}/groups/keyfmt/private/docs/nested/file.txt", alice.id());

    // Permission granted at parent should apply to deep child via both path forms.
    let bob_deep_direct: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": deep_subpath_direct
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_deep_direct, WRITE,
        "parent permission must apply to deep child via direct path"
    );

    let bob_deep_prefixed: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": deep_subpath_prefixed
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_deep_prefixed, WRITE,
        "parent permission must apply to deep child via owner-prefixed path"
    );

    Ok(())
}

/// Tests account permission key edge cases:
/// - Path without `/` (single segment, no subpath)
/// - Path with owner prefix that matches (strip succeeds)
/// - Path with mismatched prefix (strip falls back to original)
#[tokio::test]
async fn test_account_permission_key_edge_cases() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // --- Scenario 1: Path with owner prefix (strip should work) ---
    let full_path = format!("{}/documents/reports/", alice.id());
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": full_path,
            "level": WRITE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "grant should succeed: {:?}", res.failures());

    // Verify permission works at child path.
    let bob_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/documents/reports/q1.pdf", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(bob_level, WRITE, "permission should apply to child path");

    // --- Scenario 2: Permission at top-level subpath (minimal depth) ---
    // Use a single-segment relative path which becomes "{account}/segment"
    let top_level_path = format!("{}/data/", alice.id());
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": top_level_path,
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "grant at top-level subpath should succeed: {:?}", res.failures());

    // Permission at top-level should apply to all nested subpaths.
    let bob_data_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/data/any/deep/path", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_data_level, MODERATE,
        "top-level permission should apply to all nested subpaths"
    );

    // --- Scenario 3: Permission granted via relative path (auto-prefixed) ---
    // Grant using just "config/" which becomes "{alice}/config/"
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "config/",
            "level": MANAGE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "grant via relative path should succeed: {:?}", res.failures());

    // Lookup via full path should find it.
    let bob_config_level: u8 = contract
        .view("get_permissions")
        .args_json(json!({
            "owner": alice.id(),
            "grantee": bob.id(),
            "path": format!("{}/config/settings", alice.id())
        }))
        .await?
        .json()?;
    assert_eq!(
        bob_config_level, MANAGE,
        "permission granted via relative path should apply via full path lookup"
    );

    Ok(())
}

// =============================================================================
// has_group_admin_permission / has_group_moderate_permission Integration Tests
// =============================================================================

/// Tests has_group_admin_permission and has_group_moderate_permission APIs:
/// - Owner has both admin and moderate permissions
/// - Member with MANAGE has admin permission
/// - Member with MODERATE has moderate but not admin permission
/// - Non-member returns false
/// - Nonexistent group returns false
#[tokio::test]
async fn test_has_group_admin_and_moderate_permission_queries() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let carol = create_user(&root, "carol", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // 1. Create a group with alice as owner.
    create_group(&contract, &alice, "test-perms").await?;

    // 2. Owner (alice) should have both admin and moderate permission.
    let alice_admin: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(alice_admin, "Owner should have admin permission");

    let alice_moderate: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(alice_moderate, "Owner should have moderate permission");

    // 3. Add bob as member with no special permissions.
    add_member(&contract, &alice, "test-perms", &bob).await?;

    let bob_admin: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_admin, "Regular member should not have admin permission");

    let bob_moderate: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_moderate, "Regular member should not have moderate permission");

    // 4. Grant MODERATE to bob on group config path.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/test-perms/config",
            "level": MODERATE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission(MODERATE) should succeed: {:?}", res.failures());

    let bob_admin_after: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_admin_after, "MODERATE does not grant admin permission");

    let bob_moderate_after: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(bob_moderate_after, "Member with MODERATE should have moderate permission");

    // 5. Add carol as member and grant MANAGE.
    add_member(&contract, &alice, "test-perms", &carol).await?;
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/test-perms/config",
            "level": MANAGE,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission(MANAGE) should succeed: {:?}", res.failures());

    let carol_admin: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": carol.id()
        }))
        .await?
        .json()?;
    assert!(carol_admin, "Member with MANAGE should have admin permission");

    let carol_moderate: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": carol.id()
        }))
        .await?
        .json()?;
    assert!(carol_moderate, "Member with MANAGE should also have moderate permission");

    // 6. Non-member should return false.
    let stranger = create_user(&root, "stranger", TEN_NEAR).await?;
    let stranger_admin: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": stranger.id()
        }))
        .await?
        .json()?;
    assert!(!stranger_admin, "Non-member should not have admin permission");

    let stranger_moderate: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "test-perms",
            "user_id": stranger.id()
        }))
        .await?
        .json()?;
    assert!(!stranger_moderate, "Non-member should not have moderate permission");

    // 7. Nonexistent group should return false (not error).
    let fake_admin: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "nonexistent-group",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(!fake_admin, "Nonexistent group should return false for admin");

    let fake_moderate: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "nonexistent-group",
            "user_id": alice.id()
        }))
        .await?
        .json()?;
    assert!(!fake_moderate, "Nonexistent group should return false for moderate");

    Ok(())
}

/// Tests permission expiration edge cases:
/// - An expired permission should not grant access
/// - A still-valid permission (future expiration) should grant access
/// - Permission can be refreshed after expiration
#[tokio::test]
async fn test_group_permission_expiration_edge_cases() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;

    deposit_storage(&contract, &alice, ONE_NEAR).await?;

    // Create group and add bob as member.
    create_group(&contract, &alice, "expiry-test").await?;
    add_member(&contract, &alice, "expiry-test", &bob).await?;

    // 1. Grant MODERATE with an already-expired timestamp (1 nanosecond in the past).
    let now = now_nanos(&worker).await?;
    let expired_at = now.saturating_sub(1); // 1 ns in the past

    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/expiry-test/config",
            "level": MODERATE,
            "expires_at": expired_at.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission with past expiry should succeed: {:?}", res.failures());

    // Verify: expired permission should NOT grant access.
    let bob_moderate_expired: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "expiry-test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_moderate_expired, "Expired permission should not grant moderate access");

    let bob_admin_expired: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "expiry-test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_admin_expired, "Expired permission should not grant admin access");

    // 2. Grant MODERATE with future expiration (1 hour from now).
    let future_at = now + 3_600_000_000_000u64; // +1 hour in nanoseconds

    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/expiry-test/config",
            "level": MODERATE,
            "expires_at": future_at.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission with future expiry should succeed: {:?}", res.failures());

    // Verify: valid permission should grant access.
    let bob_moderate_valid: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "expiry-test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(bob_moderate_valid, "Valid (future) permission should grant moderate access");

    // 3. Grant MANAGE with near-boundary expiration (current block + small delta).
    //    This tests that the comparison is correct at the boundary.
    let carol = create_user(&root, "carol", TEN_NEAR).await?;
    add_member(&contract, &alice, "expiry-test", &carol).await?;

    // Use a timestamp that is definitely in the future (add 10 seconds to be safe).
    let boundary_at = now + 10_000_000_000u64; // +10 seconds

    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": carol.id(),
            "path": "groups/expiry-test/config",
            "level": MANAGE,
            "expires_at": boundary_at.to_string()
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "set_permission with boundary expiry should succeed: {:?}", res.failures());

    let carol_admin_boundary: bool = contract
        .view("has_group_admin_permission")
        .args_json(json!({
            "group_id": "expiry-test",
            "user_id": carol.id()
        }))
        .await?
        .json()?;
    assert!(carol_admin_boundary, "Permission with boundary expiration should still be valid");

    // 4. Revoke by setting level to 0 (NONE) and verify.
    let res = alice
        .call(contract.id(), "set_permission")
        .args_json(json!({
            "grantee": bob.id(),
            "path": "groups/expiry-test/config",
            "level": 0,
            "expires_at": null
        }))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(res.is_success(), "revoke permission should succeed: {:?}", res.failures());

    let bob_moderate_revoked: bool = contract
        .view("has_group_moderate_permission")
        .args_json(json!({
            "group_id": "expiry-test",
            "user_id": bob.id()
        }))
        .await?
        .json()?;
    assert!(!bob_moderate_revoked, "Revoked permission should not grant access");

    Ok(())
}
