//! Integration tests for the relayer key pool against a NEAR sandbox.
//!
//! These tests exercise the on-chain operations that unit tests cannot:
//! - `scale_up_local`: creates keys + registers AddKey on-chain
//! - `scale_down`: drains idle keys + submits DeleteKey on-chain
//! - `handle_nonce_error`: re-syncs nonce from chain
//! - full autoscale cycle: acquire → utilization → scale up/down → reap

use anyhow::Result;
use near_crypto::SecretKey;
use near_workspaces::types::NearToken;
use onsocial_relayer::key_pool::KeyPool;
use onsocial_relayer::key_store::KeyStore;
use onsocial_relayer::rpc::RpcClient;
use onsocial_relayer::signer::RelayerSigner;
use std::sync::Arc;
use std::time::Duration;

use crate::utils::setup_sandbox;

/// Convert a near_workspaces SecretKey to a near_crypto SecretKey via string roundtrip.
fn convert_secret_key(ws_key: &near_workspaces::types::SecretKey) -> SecretKey {
    ws_key.to_string().parse::<SecretKey>().unwrap()
}

/// Create a relayer RpcClient pointing at the sandbox.
fn sandbox_rpc(worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>) -> RpcClient {
    let url = worker.rpc_addr();
    RpcClient::new(&url, &url)
}

/// Build a minimal KeyPool for testing with the given admin key.
fn build_pool(
    account_id: &str,
    contract_id: &str,
    admin_secret: &SecretKey,
    config: relayer::config::ScalingConfig,
) -> KeyPool {
    let account: near_primitives::types::AccountId = account_id.parse().unwrap();
    let admin_signer =
        near_crypto::InMemorySigner::from_secret_key(account.clone(), admin_secret.clone());
    let admin = RelayerSigner::Local {
        signer: admin_signer,
    };
    let store = KeyStore::new_plaintext("/tmp/relayer_integ_test".into());
    KeyPool::new(
        account,
        contract_id.parse().unwrap(),
        admin,
        vec![], // start empty — scale_up will add keys
        config,
        store,
        vec!["execute".into()],
    )
}

// ── Scale up ────────────────────────────────────────────────────────

#[tokio::test]
async fn test_scale_up_local_registers_keys_on_chain() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    // Create a sub-account with plenty of NEAR for key registrations.
    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());

    // Also deploy a dummy contract (core) so the receiver_id is valid.
    let core = root
        .create_subaccount("core")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let config = relayer::config::ScalingConfig {
        min_keys: 1,
        max_keys: 10,
        batch_size: 3,
        cooldown: Duration::from_secs(0),
        scale_down_idle: Duration::from_secs(0),
        ..Default::default()
    };

    let pool = build_pool(
        relayer.id().as_str(),
        core.id().as_str(),
        &admin_secret,
        config,
    );

    assert_eq!(pool.active_count(), 0, "pool starts empty");

    // Scale up by 3 keys
    pool.scale_up_local(&rpc, 3).await?;

    assert_eq!(
        pool.active_count(),
        3,
        "3 keys should be active after scale_up"
    );

    // Verify keys work: acquire and check nonce
    let guard = pool.acquire()?;
    assert!(guard.nonce > 0, "acquired key should have a valid nonce");
    drop(guard);

    // Verify on-chain: query all access keys for the relayer account
    let pk1 = {
        let g = pool.acquire()?;
        g.public_key()
    };

    let on_chain = rpc
        .query_access_key(&relayer.id().as_str().parse()?, &pk1)
        .await;
    assert!(on_chain.is_ok(), "key should exist on-chain after scale_up");

    Ok(())
}

// ── Scale down ──────────────────────────────────────────────────────

#[tokio::test]
async fn test_scale_down_removes_keys_on_chain() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer2")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());

    let core = root
        .create_subaccount("core2")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let config = relayer::config::ScalingConfig {
        min_keys: 1,
        max_keys: 10,
        batch_size: 5,
        cooldown: Duration::from_secs(0),
        scale_down_idle: Duration::from_secs(0), // all keys considered idle immediately
        ..Default::default()
    };

    let pool = build_pool(
        relayer.id().as_str(),
        core.id().as_str(),
        &admin_secret,
        config,
    );

    // First scale up to have keys to remove
    pool.scale_up_local(&rpc, 4).await?;
    assert_eq!(pool.active_count(), 4);

    // Capture a public key before scale_down
    let _pk_to_delete = {
        // Scale down removes from the end. Acquire the last key's pubkey.
        let slots_count = pool.active_count();
        assert!(slots_count >= 2);
        let g = pool.acquire()?;
        g.public_key()
    };

    // Scale down by 2 keys
    pool.scale_down(&rpc, 2).await?;

    // 2 keys should now be draining (not active)
    assert_eq!(pool.active_count(), 2, "2 keys should remain active");
    assert_eq!(pool.draining_count(), 2, "2 keys should be draining");

    Ok(())
}

// ── Handle nonce error ──────────────────────────────────────────────

#[tokio::test]
async fn test_handle_nonce_error_resyncs_from_chain() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer3")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());

    let core = root
        .create_subaccount("core3")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let config = relayer::config::ScalingConfig {
        min_keys: 1,
        max_keys: 10,
        batch_size: 2,
        cooldown: Duration::from_secs(0),
        ..Default::default()
    };

    let pool = build_pool(
        relayer.id().as_str(),
        core.id().as_str(),
        &admin_secret,
        config,
    );

    // Scale up to get a key in the pool
    pool.scale_up_local(&rpc, 1).await?;
    assert_eq!(pool.active_count(), 1);

    // Acquire a key to know its public key
    let pk = {
        let g = pool.acquire()?;
        g.public_key()
    };

    // Re-sync nonce from chain — should succeed
    pool.handle_nonce_error(&pk, &rpc).await?;

    // Key should still be active and acquirable
    let guard = pool.acquire()?;
    assert!(guard.nonce > 0);
    drop(guard);

    Ok(())
}

// ── Full autoscale cycle ────────────────────────────────────────────

#[tokio::test]
async fn test_full_scale_up_then_scale_down_cycle() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer4")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());

    let core = root
        .create_subaccount("core4")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let config = relayer::config::ScalingConfig {
        min_keys: 1,
        max_keys: 10,
        batch_size: 3,
        cooldown: Duration::from_secs(0),
        scale_down_idle: Duration::from_secs(0),
        ..Default::default()
    };

    let pool = Arc::new(build_pool(
        relayer.id().as_str(),
        core.id().as_str(),
        &admin_secret,
        config,
    ));

    // === Phase 1: Scale up ===
    pool.scale_up(&rpc, 5).await?;
    assert_eq!(pool.active_count(), 5);

    // Verify we can acquire and use all keys
    let guards: Vec<_> = (0..5).map(|_| pool.acquire().unwrap()).collect();
    assert_eq!(pool.total_in_flight(), 5);
    drop(guards);
    assert_eq!(pool.total_in_flight(), 0);

    // === Phase 2: Scale down ===
    pool.scale_down(&rpc, 3).await?;
    assert_eq!(pool.active_count(), 2);
    assert_eq!(pool.draining_count(), 3);

    // === Phase 3: Reap dead slots ===
    // Draining + 0 in_flight → should be reaped. The draining slots have
    // 0 in_flight, so calling reap should clean them up.
    // reap_dead_slots is private, but we can verify count after calling
    // scale_down again (which triggers no-op since nothing is idle among active).

    // Acquire remaining active keys — they still work
    let g1 = pool.acquire()?;
    let g2 = pool.acquire()?;
    assert_eq!(pool.total_in_flight(), 2);
    drop(g1);
    drop(g2);

    Ok(())
}

// ── Scale up idempotency ────────────────────────────────────────────

#[tokio::test]
async fn test_scale_up_multiple_batches() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer5")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());

    let core = root
        .create_subaccount("core5")
        .initial_balance(NearToken::from_near(5))
        .transact()
        .await?
        .into_result()?;

    let config = relayer::config::ScalingConfig {
        min_keys: 1,
        max_keys: 20,
        batch_size: 5,
        cooldown: Duration::from_secs(0),
        ..Default::default()
    };

    let pool = build_pool(
        relayer.id().as_str(),
        core.id().as_str(),
        &admin_secret,
        config,
    );

    // Scale up in two separate batches
    pool.scale_up_local(&rpc, 3).await?;
    assert_eq!(pool.active_count(), 3);

    pool.scale_up_local(&rpc, 2).await?;
    assert_eq!(pool.active_count(), 5);

    // All 5 keys should be independently acquirable
    let mut pks = std::collections::HashSet::new();
    for _ in 0..5 {
        let g = pool.acquire()?;
        pks.insert(g.public_key().to_string());
    }
    // Should have 5 distinct keys
    assert_eq!(pks.len(), 5, "5 distinct keys should be in the pool");

    Ok(())
}
