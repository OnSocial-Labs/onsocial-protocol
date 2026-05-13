//! End-to-end NEP-366 delegate coverage against a live sandbox.

use anyhow::Result;
use axum::body::Body;
use axum::http::{Request, StatusCode};
use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use http_body_util::BodyExt;
use near_crypto::{InMemorySigner, KeyType, SecretKey, Signer};
use near_primitives::action::delegate::{DelegateAction, NonDelegateAction, SignedDelegateAction};
use near_primitives::action::{Action, FunctionCallAction};
use near_workspaces::types::{AccessKey, Gas, NearToken};
use onsocial_relayer::AppState;
use onsocial_relayer::config::Config;
use onsocial_relayer::create_router;
use onsocial_relayer::key_pool::{KeyPool, PoolConfig};
use onsocial_relayer::key_store::KeyStore;
use onsocial_relayer::rpc::RpcClient;
use onsocial_relayer::signer::RelayerSigner;
use serde_json::json;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64};
use std::time::Instant;
use tower::ServiceExt;

use crate::utils::setup_sandbox;

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_core_wasm() -> Result<Vec<u8>> {
    for path in [
        "../target/near/core_onsocial/core_onsocial.wasm",
        "target/near/core_onsocial/core_onsocial.wasm",
        "/code/target/near/core_onsocial/core_onsocial.wasm",
    ] {
        if let Ok(wasm) = std::fs::read(std::path::Path::new(path)) {
            return Ok(wasm);
        }
    }
    Err(anyhow::anyhow!(
        "core_onsocial.wasm not found; run `make build-contract-core-onsocial` first"
    ))
}

/// Convert a `near_workspaces::types::SecretKey` to a `near_crypto::SecretKey`
/// by string roundtrip — the only stable cross-type conversion in 0.22.
fn ws_to_crypto_sk(ws: &near_workspaces::types::SecretKey) -> SecretKey {
    ws.to_string()
        .parse::<SecretKey>()
        .expect("secret key parse")
}

fn ws_to_crypto_pk(ws: &near_workspaces::types::PublicKey) -> near_crypto::PublicKey {
    ws.to_string()
        .parse::<near_crypto::PublicKey>()
        .expect("public key parse")
}

fn crypto_to_ws_pk(pk: &near_crypto::PublicKey) -> near_workspaces::types::PublicKey {
    pk.to_string().parse().expect("ws public key parse")
}

/// Build a single-key `KeyPool` containing the relayer account's full-access
/// key as an ACTIVE slot — bypasses chain bootstrap (we don't need the
/// autoscaler for a single test transaction).
fn build_relayer_key_pool(
    relayer_id: &near_primitives::types::AccountId,
    relayer_sk: &SecretKey,
    starting_nonce: u64,
    tmp_store_path: std::path::PathBuf,
) -> KeyPool {
    let admin_signer_inner =
        InMemorySigner::from_secret_key(relayer_id.clone(), relayer_sk.clone());
    let admin = RelayerSigner::Local {
        signer: admin_signer_inner,
    };
    // `/execute_delegate` signs the outer transaction with a full-access
    // delegate signer lane, so the relayer key is registered in the delegate pool.
    let slot_signer_inner = InMemorySigner::from_secret_key(relayer_id.clone(), relayer_sk.clone());
    let slot_signer = RelayerSigner::Local {
        signer: slot_signer_inner,
    };

    let pool_cfg = PoolConfig {
        account_id: relayer_id.clone(),
        admin_signer: admin,
        store: KeyStore::new_plaintext(tmp_store_path),
    };

    KeyPool::new(pool_cfg, vec![(slot_signer, starting_nonce)])
}

#[tokio::test]
async fn delegate_e2e_inner_receipt_attributed_to_user() -> Result<()> {
    // Deploy sandbox and contract.
    let worker = setup_sandbox().await?;
    let root = worker.root_account()?;
    let wasm = load_core_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;
    contract.call("new").args_json(json!({})).transact().await?;
    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    // Create the user and relayer accounts.
    let alice = root
        .create_subaccount("alice")
        .initial_balance(TEN_NEAR)
        .transact()
        .await?
        .into_result()?;
    let relayer = root
        .create_subaccount("relayer")
        .initial_balance(TEN_NEAR)
        .transact()
        .await?
        .into_result()?;

    // Storage deposit for alice (FunctionCall keys can't attach deposits, so
    // the user's full-access key pays this once at onboarding — same as our
    // SDK `bootstrapSession` flow).
    let res = alice
        .call(contract.id(), "execute_admin")
        .args_json(json!({
            "request": {
                "action": {
                    "type": "set",
                    "data": { "storage/deposit": { "amount": ONE_NEAR.as_yoctonear().to_string() } }
                },
                "options": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "alice storage deposit failed: {:?}",
        res.failures()
    );

    // Add the session FunctionCall key on alice.
    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();
    let session_signer =
        InMemorySigner::from_secret_key(alice.id().as_str().parse().unwrap(), session_sk.clone());

    let session_pk_ws = crypto_to_ws_pk(&session_pk);
    let add_key_res = alice
        .batch(alice.id())
        .add_key(
            session_pk_ws.clone(),
            AccessKey::function_call_access(
                contract.id(),
                &["execute"],
                Some(NearToken::from_millinear(250)),
            ),
        )
        .transact()
        .await?;
    assert!(
        add_key_res.is_success(),
        "AddKey failed: {:?}",
        add_key_res.failures()
    );

    // Point the relayer state at the sandbox RPC.
    let rpc_url = worker.rpc_addr();
    let rpc = RpcClient::new(&rpc_url, &rpc_url);
    let relayer_id: near_primitives::types::AccountId = relayer.id().as_str().parse().unwrap();
    let contract_id: near_primitives::types::AccountId = contract.id().as_str().parse().unwrap();

    let relayer_sk = ws_to_crypto_sk(relayer.secret_key());
    let relayer_pk = relayer_sk.public_key();
    let relayer_nonce = rpc.query_access_key(&relayer_id, &relayer_pk).await?.nonce;

    let store_dir = tempdir_path("relayer_e2e_store");
    let key_pool = Arc::new(build_relayer_key_pool(
        &relayer_id,
        &relayer_sk,
        relayer_nonce,
        store_dir,
    ));

    let mut config = Config::default();
    config.rpc_url = rpc_url.clone();
    config.fallback_rpc_url = rpc_url.clone();
    config.relayer_account_id = relayer_id.to_string();
    config.allowed_contracts = vec![contract_id.to_string()];

    let state = Arc::new(AppState {
        config,
        rpc,
        key_pool,
        allowed_contracts: vec![contract_id.clone()],
        allowed_methods: vec!["execute".into()],
        start_time: Instant::now(),
        request_count: AtomicU64::new(0),
        ready: AtomicBool::new(true),
    });

    let router = create_router(state.clone());

    // Build the delegate that calls `core.execute` as alice.
    let session_alice: near_primitives::types::AccountId = alice.id().as_str().parse().unwrap();
    let session_nonce = state
        .rpc
        .query_access_key(&session_alice, &session_pk)
        .await?
        .nonce
        + 1;
    let (_block_hash, block_height) = state.rpc.latest_block().await?;
    let max_block_height = block_height + 100;

    let inner_args = serde_json::to_vec(&json!({
        "request": {
            "action": {
                "type": "set",
                "data": { "profile/name": "Alice via delegate" }
            },
            "options": null
        }
    }))?;

    let inner_fc = Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "execute".into(),
        args: inner_args,
        gas: 100_000_000_000_000, // 100 TGas
        deposit: 0,
    }));
    let inner_non_delegate: NonDelegateAction = inner_fc
        .try_into()
        .expect("FunctionCall is a non-delegate action");

    let delegate = DelegateAction {
        sender_id: session_alice.clone(),
        receiver_id: contract_id.clone(),
        actions: vec![inner_non_delegate],
        nonce: session_nonce,
        max_block_height,
        public_key: session_pk.clone(),
    };

    let hash = delegate.get_nep461_hash();
    let signature = session_signer.sign(hash.as_ref());

    let signed_delegate = SignedDelegateAction {
        delegate_action: delegate,
        signature,
    };
    assert!(
        signed_delegate.verify(),
        "locally constructed SignedDelegateAction must self-verify"
    );

    // Submit the delegate through the in-process router.
    let bytes = borsh::to_vec(&signed_delegate)?;
    let body = serde_json::to_vec(&json!({
        "signed_delegate": B64.encode(&bytes)
    }))?;
    let request = Request::builder()
        .method("POST")
        .uri("/execute_delegate?wait=true")
        .header("content-type", "application/json")
        .body(Body::from(body))?;

    let response = router.oneshot(request).await?;
    let status = response.status();
    let body_bytes = response.into_body().collect().await?.to_bytes();
    let body_value: serde_json::Value = serde_json::from_slice(&body_bytes)
        .unwrap_or_else(|e| json!({ "_decode_error": e.to_string(), "_raw": String::from_utf8_lossy(&body_bytes).to_string() }));

    assert_eq!(
        status,
        StatusCode::OK,
        "expected 200 OK, got {status}: {body_value}"
    );
    assert_eq!(
        body_value["success"].as_bool(),
        Some(true),
        "relayer reported failure: {body_value}"
    );
    assert!(
        body_value["tx_hash"].as_str().is_some(),
        "missing tx_hash: {body_value}"
    );

    // Inspect the on-chain outcome and verify attribution.
    let tx_hash_str = body_value["tx_hash"].as_str().unwrap();
    let tx_hash: near_primitives::hash::CryptoHash = tx_hash_str.parse().expect("tx hash parse");
    let outcome = state
        .rpc
        .tx_status(tx_hash, &relayer_id)
        .await
        .expect("tx_status");
    eprintln!("--- delegate tx outcome ---");
    eprintln!("status: {:?}", outcome.status);
    eprintln!(
        "tx_outcome: executor={} status={:?} logs={:?}",
        outcome.transaction_outcome.outcome.executor_id,
        outcome.transaction_outcome.outcome.status,
        outcome.transaction_outcome.outcome.logs
    );
    for (i, r) in outcome.receipts_outcome.iter().enumerate() {
        eprintln!(
            "receipt[{i}] id={} executor={} status={:?} logs={:?}",
            r.id, r.outcome.executor_id, r.outcome.status, r.outcome.logs
        );
    }

    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({ "key": "profile/name", "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(
        v.get("value"),
        Some(&json!("Alice via delegate")),
        "expected alice's profile/name to be written via delegate, got: {v}"
    );

    Ok(())
}

#[tokio::test]
async fn delegate_e2e_rejects_disallowed_inner_receiver() -> Result<()> {
    // Inner-receiver allowlist enforcement — relayer must NOT broadcast a
    // delegate that targets a contract outside `allowed_contracts`.
    let worker = setup_sandbox().await?;
    let root = worker.root_account()?;
    let wasm = load_core_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;
    contract.call("new").args_json(json!({})).transact().await?;
    contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    let alice = root
        .create_subaccount("alice")
        .initial_balance(TEN_NEAR)
        .transact()
        .await?
        .into_result()?;
    let relayer = root
        .create_subaccount("relayer")
        .initial_balance(TEN_NEAR)
        .transact()
        .await?
        .into_result()?;
    // A second contract that is NOT on the allowlist.
    let other_contract = root
        .create_subaccount("other")
        .initial_balance(NearToken::from_near(2))
        .transact()
        .await?
        .into_result()?;

    let session_sk = SecretKey::from_random(KeyType::ED25519);
    let session_pk = session_sk.public_key();
    let session_signer =
        InMemorySigner::from_secret_key(alice.id().as_str().parse().unwrap(), session_sk);

    let rpc_url = worker.rpc_addr();
    let rpc = RpcClient::new(&rpc_url, &rpc_url);
    let relayer_id: near_primitives::types::AccountId = relayer.id().as_str().parse().unwrap();
    let contract_id: near_primitives::types::AccountId = contract.id().as_str().parse().unwrap();
    let other_id: near_primitives::types::AccountId = other_contract.id().as_str().parse().unwrap();
    let alice_id: near_primitives::types::AccountId = alice.id().as_str().parse().unwrap();

    let relayer_sk = ws_to_crypto_sk(relayer.secret_key());
    let relayer_nonce = rpc
        .query_access_key(&relayer_id, &relayer_sk.public_key())
        .await?
        .nonce;

    let key_pool = Arc::new(build_relayer_key_pool(
        &relayer_id,
        &relayer_sk,
        relayer_nonce,
        tempdir_path("relayer_e2e_store_neg"),
    ));

    let mut config = Config::default();
    config.rpc_url = rpc_url.clone();
    config.fallback_rpc_url = rpc_url.clone();
    config.relayer_account_id = relayer_id.to_string();
    config.allowed_contracts = vec![contract_id.to_string()];

    let state = Arc::new(AppState {
        config,
        rpc,
        key_pool,
        allowed_contracts: vec![contract_id.clone()],
        allowed_methods: vec!["execute".into()],
        start_time: Instant::now(),
        request_count: AtomicU64::new(0),
        ready: AtomicBool::new(true),
    });
    let router = create_router(state.clone());

    let (_h, block_height) = state.rpc.latest_block().await?;
    // Build a delegate targeting `other_id` (not allowlisted).
    let inner_fc = Action::FunctionCall(Box::new(FunctionCallAction {
        method_name: "noop".into(),
        args: b"{}".to_vec(),
        gas: 30_000_000_000_000,
        deposit: 0,
    }));
    let delegate = DelegateAction {
        sender_id: alice_id,
        receiver_id: other_id.clone(),
        actions: vec![inner_fc.try_into().unwrap()],
        nonce: 1,
        max_block_height: block_height + 100,
        public_key: session_pk,
    };
    let signature = session_signer.sign(delegate.get_nep461_hash().as_ref());
    let signed = SignedDelegateAction {
        delegate_action: delegate,
        signature,
    };

    let bytes = borsh::to_vec(&signed)?;
    let body = serde_json::to_vec(&json!({ "signed_delegate": B64.encode(&bytes) }))?;
    let request = Request::builder()
        .method("POST")
        .uri("/execute_delegate")
        .header("content-type", "application/json")
        .body(Body::from(body))?;

    let response = router.oneshot(request).await?;
    assert_eq!(
        response.status(),
        StatusCode::BAD_REQUEST,
        "expected 400 for non-allowlisted inner receiver"
    );
    Ok(())
}

fn tempdir_path(prefix: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    let path = std::env::temp_dir().join(format!("{prefix}-{nanos}"));
    std::fs::create_dir_all(&path).ok();
    path
}
