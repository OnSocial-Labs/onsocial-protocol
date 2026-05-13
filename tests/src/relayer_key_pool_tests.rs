//! Integration tests for the relayer FullAccess delegate signer pool.

use anyhow::Result;
use near_crypto::SecretKey;
use near_primitives::views::AccessKeyPermissionView;
use near_workspaces::types::NearToken;
use onsocial_relayer::key_pool::{KeyPool, PoolConfig};
use onsocial_relayer::key_store::KeyStore;
use onsocial_relayer::rpc::RpcClient;
use onsocial_relayer::signer::RelayerSigner;

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

fn build_pool(account_id: &str, admin_secret: &SecretKey) -> KeyPool {
    let account: near_primitives::types::AccountId = account_id.parse().unwrap();
    let admin_signer =
        near_crypto::InMemorySigner::from_secret_key(account.clone(), admin_secret.clone());
    let admin = RelayerSigner::Local {
        signer: admin_signer,
    };
    let store = KeyStore::new_plaintext(format!("/tmp/relayer_delegate_{account_id}.json").into());
    let pool_config = PoolConfig {
        account_id: account,
        admin_signer: admin,
        store,
    };
    KeyPool::new(pool_config, vec![])
}

#[tokio::test]
async fn test_ensure_delegate_pool_registers_full_access_keys_on_chain() -> Result<()> {
    let worker = setup_sandbox().await?;
    let rpc = sandbox_rpc(&worker);

    let root = worker.root_account()?;
    let relayer = root
        .create_subaccount("relayer")
        .initial_balance(NearToken::from_near(30))
        .transact()
        .await?
        .into_result()?;

    let admin_secret = convert_secret_key(relayer.secret_key());
    let pool = build_pool(relayer.id().as_str(), &admin_secret);

    pool.ensure_delegate_pool(&rpc, 3).await?;
    assert_eq!(pool.active_delegate_count(), 3);

    let guard = pool.acquire_delegate()?;
    let access_key = rpc
        .query_access_key(&relayer.id().as_str().parse()?, &guard.public_key())
        .await?;
    assert!(matches!(
        access_key.permission,
        AccessKeyPermissionView::FullAccess
    ));

    Ok(())
}

#[tokio::test]
async fn test_ensure_delegate_pool_is_idempotent_once_target_met() -> Result<()> {
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
    let pool = build_pool(relayer.id().as_str(), &admin_secret);

    pool.ensure_delegate_pool(&rpc, 2).await?;
    pool.ensure_delegate_pool(&rpc, 2).await?;

    assert_eq!(pool.active_delegate_count(), 2);

    Ok(())
}

#[tokio::test]
async fn test_delegate_guard_releases_in_flight() -> Result<()> {
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
    let pool = build_pool(relayer.id().as_str(), &admin_secret);

    pool.ensure_delegate_pool(&rpc, 1).await?;
    {
        let _guard = pool.acquire_delegate()?;
        assert_eq!(pool.delegate_total_in_flight(), 1);
    }
    assert_eq!(pool.delegate_total_in_flight(), 0);

    Ok(())
}
