// Integration tests for intents-onsocial happy paths.

use base64::Engine;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::{U64, U128};
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

const TEN_NEAR: NearToken = NearToken::from_near(10);

fn load_intents_wasm() -> anyhow::Result<Vec<u8>> {
    let paths = [
        "../target/near/intents_onsocial/intents_onsocial.wasm",
        "target/near/intents_onsocial/intents_onsocial.wasm",
        "/code/target/near/intents_onsocial/intents_onsocial.wasm",
    ];
    for p in paths {
        if let Ok(w) = std::fs::read(std::path::Path::new(p)) {
            return Ok(w);
        }
    }
    Err(anyhow::anyhow!(
        "intents_onsocial.wasm not found — run `make build-contract-intents-onsocial`"
    ))
}

async fn deploy_and_init(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<(Contract, Account)> {
    let wasm = load_intents_wasm()?;
    let contract = worker.dev_deploy(&wasm).await?;
    let owner = contract.as_account().clone();
    contract
        .call("new")
        .args_json(json!({ "owner_id": owner.id() }))
        .transact()
        .await?
        .into_result()?;
    Ok((contract, owner))
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    Ok(root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?)
}

fn make_oracle_keypair(seed: u8) -> (SigningKey, String) {
    let sk = SigningKey::from_bytes(&[seed; 32]);
    let pk_bytes = sk.verifying_key().to_bytes();
    let pk_str = format!("ed25519:{}", bs58::encode(pk_bytes).into_string());
    (sk, pk_str)
}

fn canonicalize_json(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let mut keys: Vec<_> = map.keys().cloned().collect();
            keys.sort();
            let mut out = serde_json::Map::with_capacity(map.len());
            for k in keys {
                let v = map.get(&k).expect("key exists");
                out.insert(k, canonicalize_json(v));
            }
            Value::Object(out)
        }
        Value::Array(arr) => Value::Array(arr.iter().map(canonicalize_json).collect()),
        other => other.clone(),
    }
}

/// Sign an OracleAuth attestation for `claim_offer`, matching the contract's
/// `authenticate_oracle` verification:
///   domain  = "onsocial:intent:oracle:v1:{contract_id}"
///   payload = { target_account, public_key, nonce(str), expires_at_ms(str),
///               action(canonicalized), delegate_action: null }
///   message = domain.bytes() || 0x00 || serde_json::to_vec(payload)
///   sig     = ed25519(sha256(message))
///
/// `target_account` for oracle path is `current_account_id` (the contract).
fn sign_oracle_claim(
    contract_id: &str,
    pk_str: &str,
    offer_id: u64,
    winner: &str,
    evidence_hash: &str,
    nonce: u64,
    expires_at_ms: u64,
    sk: &SigningKey,
) -> String {
    let action = json!({
        "method": "claim_offer",
        "offer_id": U64(offer_id),
        "winner": winner,
        "evidence_hash": evidence_hash,
    });
    // Mirror the contract oracle signing payload key order:
    // target_account, public_key, nonce, expires_at_ms, action, delegate_action.
    let payload = json!({
        "target_account": contract_id,
        "public_key": pk_str,
        "nonce": nonce.to_string(),
        "expires_at_ms": expires_at_ms.to_string(),
        "action": canonicalize_json(&action),
        "delegate_action": Value::Null,
    });
    let domain = format!("onsocial:intent:oracle:v1:{contract_id}");
    let mut msg = domain.into_bytes();
    msg.push(0);
    msg.extend_from_slice(serde_json::to_vec(&payload).unwrap().as_slice());
    let digest: [u8; 32] = Sha256::digest(&msg).into();
    let sig = sk.sign(&digest);
    BASE64_ENGINE.encode(sig.to_bytes())
}

fn one_near_yocto() -> u128 {
    1_000_000_000_000_000_000_000_000
}

fn storage_per_offer_yocto() -> u128 {
    5_000_000_000_000_000_000_000
}

#[tokio::test]
async fn test_create_offer_locks_escrow() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let (contract, _owner) = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bounty = one_near_yocto(); // 1 NEAR
    let now_ms = (worker.view_block().await?.timestamp() / 1_000_000) as u64;

    let res = alice
        .call(contract.id(), "create_offer")
        .args_json(json!({
            "input": {
                "kind": { "BoostViews": { "post_path": "alice/post/1", "target_views": 1000 } },
                "bounty": U128(bounty),
                "deadline_ms": U64(now_ms + 600_000),
            }
        }))
        .deposit(NearToken::from_yoctonear(
            bounty + storage_per_offer_yocto(),
        ))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "create_offer failed: {:?}",
        res.failures()
    );

    let stats: Value = contract.view("get_stats").await?.json()?;
    assert_eq!(
        stats["escrow_locked"].as_str(),
        Some(bounty.to_string().as_str())
    );
    assert_eq!(stats["next_offer_id"].as_str(), Some("2"));
    Ok(())
}

#[tokio::test]
async fn test_claim_with_valid_oracle_signature_releases_bounty() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let (contract, owner) = deploy_and_init(&worker).await?;

    // Register oracle key.
    let (oracle_sk, oracle_pk) = make_oracle_keypair(7);
    owner
        .call(contract.id(), "add_oracle_pk")
        .args_json(json!({ "key": oracle_pk }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;
    let bounty = one_near_yocto();
    let now_ms = (worker.view_block().await?.timestamp() / 1_000_000) as u64;

    alice
        .call(contract.id(), "create_offer")
        .args_json(json!({
            "input": {
                "kind": { "BoostViews": { "post_path": "alice/post/1", "target_views": 1000 } },
                "bounty": U128(bounty),
                "deadline_ms": U64(now_ms + 600_000),
            }
        }))
        .deposit(NearToken::from_yoctonear(
            bounty + storage_per_offer_yocto(),
        ))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?
        .into_result()?;

    let solver_balance_before = solver.view_account().await?.balance.as_yoctonear();

    let evidence_hash = "deadbeefcafef00d";
    let nonce: u64 = 1;
    let expires_at_ms: u64 = 0; // no expiry
    let sig = sign_oracle_claim(
        contract.id().as_str(),
        &oracle_pk,
        1,
        solver.id().as_str(),
        evidence_hash,
        nonce,
        expires_at_ms,
        &oracle_sk,
    );

    let res = solver
        .call(contract.id(), "claim_offer")
        .args_json(json!({
            "offer_id": U64(1),
            "winner": solver.id(),
            "evidence_hash": evidence_hash,
            "attestation": {
                "public_key": oracle_pk,
                "nonce": U64(nonce),
                "expires_at_ms": U64(expires_at_ms),
                "signature": sig,
            }
        }))
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(res.is_success(), "claim_offer failed: {:?}", res.failures());

    let solver_balance_after = solver.view_account().await?.balance.as_yoctonear();
    let gained = solver_balance_after.saturating_sub(solver_balance_before);
    // Allow ~0.1 NEAR gas slack.
    assert!(
        gained >= bounty - 100_000_000_000_000_000_000_000,
        "solver should have received ~1 NEAR, got {gained} yocto"
    );

    let offer: Value = contract
        .view("get_offer")
        .args_json(json!({ "offer_id": U64(1) }))
        .await?
        .json()?;
    assert_eq!(offer["status"].as_str(), Some("Claimed"));
    assert_eq!(offer["winner"].as_str(), Some(solver.id().as_str()));

    Ok(())
}

#[tokio::test]
async fn test_claim_with_bad_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let (contract, owner) = deploy_and_init(&worker).await?;

    let (_oracle_sk, oracle_pk) = make_oracle_keypair(7);
    let (wrong_sk, _) = make_oracle_keypair(99);
    owner
        .call(contract.id(), "add_oracle_pk")
        .args_json(json!({ "key": oracle_pk }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;
    let bounty = one_near_yocto();
    let now_ms = (worker.view_block().await?.timestamp() / 1_000_000) as u64;

    alice
        .call(contract.id(), "create_offer")
        .args_json(json!({
            "input": {
                "kind": { "BoostViews": { "post_path": "alice/post/1", "target_views": 1000 } },
                "bounty": U128(bounty),
                "deadline_ms": U64(now_ms + 600_000),
            }
        }))
        .deposit(NearToken::from_yoctonear(
            bounty + storage_per_offer_yocto(),
        ))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?
        .into_result()?;

    // Sign with wrong key (still claims to be the allowlisted `oracle_pk` —
    // signature verification must fail because the signer key doesn't match).
    let evidence_hash = "deadbeefcafef00d";
    let nonce: u64 = 1;
    let expires_at_ms: u64 = 0;
    let bad_sig = sign_oracle_claim(
        contract.id().as_str(),
        &oracle_pk,
        1,
        solver.id().as_str(),
        evidence_hash,
        nonce,
        expires_at_ms,
        &wrong_sk,
    );

    let res = solver
        .call(contract.id(), "claim_offer")
        .args_json(json!({
            "offer_id": U64(1),
            "winner": solver.id(),
            "evidence_hash": evidence_hash,
            "attestation": {
                "public_key": oracle_pk,
                "nonce": U64(nonce),
                "expires_at_ms": U64(expires_at_ms),
                "signature": bad_sig,
            }
        }))
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(!res.is_success(), "claim with wrong sig must fail");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("AuthFailed") || err.contains("SignatureInvalid") || err.contains("BadProof"),
        "expected auth/signature failure, got: {err}"
    );

    // Escrow still locked, offer still Open.
    let stats: Value = contract.view("get_stats").await?.json()?;
    assert_eq!(
        stats["escrow_locked"].as_str(),
        Some(bounty.to_string().as_str())
    );
    let offer: Value = contract
        .view("get_offer")
        .args_json(json!({ "offer_id": U64(1) }))
        .await?
        .json()?;
    assert_eq!(offer["status"].as_str(), Some("Open"));

    Ok(())
}

#[tokio::test]
async fn test_cancel_before_deadline_by_creator_refunds() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let (contract, _owner) = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bounty = one_near_yocto();
    let now_ms = (worker.view_block().await?.timestamp() / 1_000_000) as u64;

    alice
        .call(contract.id(), "create_offer")
        .args_json(json!({
            "input": {
                "kind": { "BoostViews": { "post_path": "alice/post/1", "target_views": 1000 } },
                "bounty": U128(bounty),
                "deadline_ms": U64(now_ms + 600_000),
            }
        }))
        .deposit(NearToken::from_yoctonear(
            bounty + storage_per_offer_yocto(),
        ))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?
        .into_result()?;

    let alice_before = alice.view_account().await?.balance.as_yoctonear();

    let res = alice
        .call(contract.id(), "cancel_offer")
        .args_json(json!({ "offer_id": U64(1) }))
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "cancel_offer failed: {:?}",
        res.failures()
    );

    let alice_after = alice.view_account().await?.balance.as_yoctonear();
    let regained = alice_after.saturating_sub(alice_before);
    assert!(
        regained >= bounty - 100_000_000_000_000_000_000_000,
        "alice should have been refunded ~bounty + storage, regained {regained}"
    );

    let offer: Value = contract
        .view("get_offer")
        .args_json(json!({ "offer_id": U64(1) }))
        .await?
        .json()?;
    assert_eq!(offer["status"].as_str(), Some("Cancelled"));
    let stats: Value = contract.view("get_stats").await?.json()?;
    assert_eq!(stats["escrow_locked"].as_str(), Some("0"));

    Ok(())
}
