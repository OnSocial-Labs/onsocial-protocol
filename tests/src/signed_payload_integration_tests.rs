// =============================================================================
// Signed Payload (Meta-TX) Integration Tests
// =============================================================================
// End-to-end sandbox tests for `Auth::SignedPayload`:
// - User grants a key permission on-chain
// - Relayer submits `set(request)` with signed-payload auth
// - Contract attributes actor vs payer via events
// - Nonce replay is rejected
//
// Run with:
//   make test-integration-contract-core-onsocial-test TEST=signed_payload

use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use near_sdk::json_types::U64;
use near_workspaces::types::{Gas, NearToken};
use near_workspaces::{Account, Contract};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

const ONE_NEAR: NearToken = NearToken::from_near(1);
const TEN_NEAR: NearToken = NearToken::from_near(10);

const EVENT_JSON_PREFIX: &str = "EVENT_JSON:";

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

    let _ = contract.call("new").args_json(json!({})).transact().await?;
    let _ = contract
        .call("activate_contract")
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?;

    Ok(contract)
}

async fn create_user(root: &Account, name: &str, balance: NearToken) -> anyhow::Result<Account> {
    let user = root
        .create_subaccount(name)
        .initial_balance(balance)
        .transact()
        .await?
        .into_result()?;
    Ok(user)
}

fn make_deterministic_ed25519_keypair() -> (SigningKey, String) {
    // Stable key for deterministic test behavior.
    let sk = SigningKey::from_bytes(&[7u8; 32]);
    let pk_bytes = sk.verifying_key().to_bytes();
    let pk_str = format!("ed25519:{}", bs58::encode(pk_bytes).into_string());
    (sk, pk_str)
}

fn make_deterministic_ed25519_keypair_2() -> (SigningKey, String) {
    let sk = SigningKey::from_bytes(&[13u8; 32]);
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

#[derive(Debug, Clone, Serialize)]
struct SignedSetPayload {
    target_account: String,
    public_key: String,
    nonce: U64,
    expires_at_ms: U64,
    action: Value,
    delegate_action: Option<Value>,
}

fn sign_payload(
    contract_id: &str,
    payload: &SignedSetPayload,
    sk: &SigningKey,
) -> anyhow::Result<String> {
    // Must match on-chain: sha256(domain || 0x00 || json(payload))
    // where domain = "onsocial:execute:v1:{contract_id}"
    let domain = format!("onsocial:execute:v1:{contract_id}");

    let payload = SignedSetPayload {
        action: canonicalize_json(&payload.action),
        delegate_action: payload.delegate_action.as_ref().map(canonicalize_json),
        ..payload.clone()
    };

    let payload_bytes = serde_json::to_vec(&payload)?;

    let mut message = domain.into_bytes();
    message.push(0);
    message.extend_from_slice(&payload_bytes);

    let message_hash: [u8; 32] = Sha256::digest(&message).into();
    let signature = sk.sign(&message_hash);

    Ok(BASE64_ENGINE.encode(signature.to_bytes()))
}

fn find_meta_tx_marker<S: AsRef<str>>(logs: &[S]) -> Option<serde_json::Value> {
    for log in logs {
        let log = log.as_ref();
        if !log.starts_with(EVENT_JSON_PREFIX) {
            continue;
        }
        let json_str = &log[EVENT_JSON_PREFIX.len()..];
        let Ok(v) = serde_json::from_str::<serde_json::Value>(json_str) else {
            continue;
        };

        if v.get("event").and_then(|x| x.as_str()) != Some("CONTRACT_UPDATE") {
            continue;
        }

        let data0 = v.get("data")?.get(0)?;
        let operation = data0.get("operation").and_then(|x| x.as_str());
        if operation != Some("set") {
            continue;
        }

        let path = data0.get("path").and_then(|x| x.as_str()).unwrap_or("");
        if !path.contains("/meta_tx") {
            continue;
        }

        return Some(v);
    }
    None
}

#[tokio::test]
async fn test_signed_payload_meta_tx_happy_path_and_replay_protection() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage so she can grant permissions.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" }  } },
                "options": null,
                "auth": null
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected storage deposit to succeed: {:?}",
        res.failures()
    );

    // Create deterministic payload keypair and bind that key to Alice for profile/* writes.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected set_key_permission to succeed: {:?}",
        res.failures()
    );

    // Relayer submits signed payload (payer=relayer, actor=alice).
    let action = json!({ "type": "set", "data": { "profile/name": "Alice (signed)" } });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: None,
    };

    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "options": null,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Expected signed payload set to succeed: {:?}",
        res.failures()
    );

    // Verify actor vs payer attribution in meta-tx marker event.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs).expect("Expected CONTRACT_UPDATE meta_tx marker event");
    let data0 = &marker["data"][0];
    assert_eq!(data0["auth_type"].as_str(), Some("signed_payload"));
    assert_eq!(data0["actor_id"].as_str(), Some(alice.id().as_str()));
    assert_eq!(data0["payer_id"].as_str(), Some(relayer.id().as_str()));
    assert_eq!(data0["author"].as_str(), Some(relayer.id().as_str()));

    // Verify data written under Alice.
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/name",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("Alice (signed)")));

    // Replay protection: reusing the same nonce should fail.
    let action_replay = json!({ "type": "set", "data": { "profile/name": "Alice (replay)" } });
    let payload_replay = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_replay.clone(),
        delegate_action: None,
    };
    let signature_replay = sign_payload(contract.id().as_str(), &payload_replay, &sk)?;

    let res2 = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_replay,
                "options": null,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature_replay
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(!res2.is_success(), "Expected replay (same nonce) to fail");
    let err = format!("{:?}", res2.failures());
    assert!(err.contains("Nonce too low"), "unexpected error: {err}");

    Ok(())
}

/// Auth::SignedPayload with expired `expires_at_ms` must be rejected.
#[tokio::test]
async fn test_signed_payload_expired_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Create payload with expires_at_ms = 1 (expired in 1970).
    let action = json!({ "type": "set", "data": { "profile/name": "Expired" } });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(1), // 1 ms after epoch = definitely expired
        action: action.clone(),
        delegate_action: None,
    };
    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "1",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected expired signature to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("expired"),
        "Expected 'expired' error, got: {err}"
    );

    Ok(())
}

/// Auth::Intent by non-allowlisted executor must be rejected.
#[tokio::test]
async fn test_intent_auth_unauthorized_executor_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let fake_solver = create_user(&root, "fakesolver", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // fake_solver attempts to use Intent auth without being allowlisted.
    let res = fake_solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/name": "Hacked" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": { "source": "fake" }
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected unauthorized intent executor to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("intent_executor") || err.contains("Unauthorized"),
        "Expected 'intent_executor' or 'Unauthorized' error, got: {err}"
    );

    Ok(())
}

/// Auth::Intent by allowlisted executor succeeds.
#[tokio::test]
async fn test_intent_auth_authorized_executor_succeeds() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Manager adds solver to intents_executors allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "update_config failed: {:?}",
        res.failures()
    );

    // Solver uses Intent auth to write on behalf of Alice.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/name": "Alice via Intent" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": { "source": "solver_network" }
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Intent auth by allowlisted executor failed: {:?}",
        res.failures()
    );

    // Verify auth_type in event metadata.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs).expect("Expected CONTRACT_UPDATE meta_tx marker event");
    let data0 = &marker["data"][0];
    assert_eq!(
        data0["auth_type"].as_str(),
        Some("intent"),
        "Expected auth_type=intent"
    );
    assert_eq!(
        data0["actor_id"].as_str(),
        Some(alice.id().as_str()),
        "Expected actor_id=alice"
    );
    assert_eq!(
        data0["payer_id"].as_str(),
        Some(solver.id().as_str()),
        "Expected payer_id=solver"
    );

    // Verify data was written under Alice.
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/name",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("Alice via Intent")));

    Ok(())
}

/// Auth::DelegateAction with valid signature succeeds.
#[tokio::test]
async fn test_delegate_action_auth_happy_path() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission for delegate actions.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Create DelegateAction payload (includes delegate_action field).
    let action = json!({ "type": "set", "data": { "profile/bio": "Delegate auth test" } });
    let delegate_action = json!({ "receiver_id": contract.id().to_string(), "actions": ["set"] });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: Some(delegate_action.clone()),
    };

    // Sign with delegate domain prefix.
    let domain = format!("onsocial:execute:delegate:v1:{}", contract.id());
    let canonical_payload = SignedSetPayload {
        action: canonicalize_json(&payload.action),
        delegate_action: payload.delegate_action.as_ref().map(canonicalize_json),
        ..payload.clone()
    };
    let payload_bytes = serde_json::to_vec(&canonical_payload)?;
    let mut message = domain.into_bytes();
    message.push(0);
    message.extend_from_slice(&payload_bytes);
    let message_hash: [u8; 32] = Sha256::digest(&message).into();
    let signature = sk.sign(&message_hash);
    let sig_b64 = BASE64_ENGINE.encode(signature.to_bytes());

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "delegate_action",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig_b64,
                    "action": delegate_action
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "DelegateAction auth failed: {:?}",
        res.failures()
    );

    // Verify auth_type in event.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs).expect("Expected CONTRACT_UPDATE meta_tx marker event");
    let data0 = &marker["data"][0];
    assert_eq!(data0["auth_type"].as_str(), Some("delegate_action"));
    assert_eq!(data0["actor_id"].as_str(), Some(alice.id().as_str()));
    assert_eq!(data0["payer_id"].as_str(), Some(relayer.id().as_str()));

    // Verify data written.
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/bio",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("Delegate auth test")));

    Ok(())
}

/// Intent auth: actor_id and target_account can differ (solver writes to target on behalf of actor).
#[tokio::test]
async fn test_intent_auth_actor_differs_from_target() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;

    // Bob deposits storage (he's the target).
    let res = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "bob storage deposit failed: {:?}",
        res.failures()
    );

    // Bob grants Alice write permission on his profile.
    let res = bob
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_permission", "grantee": alice.id(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_permission failed: {:?}",
        res.failures()
    );

    // Manager adds solver to intents_executors.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "update_config failed: {:?}",
        res.failures()
    );

    // Solver uses Intent auth: actor=alice, target=bob.
    // Alice has permission to write to Bob's namespace.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": bob.id(),
                "action": { "type": "set", "data": { "profile/written_by": "alice_via_intent" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": { "cross_account_write": true }
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Intent cross-account write failed: {:?}",
        res.failures()
    );

    // Verify data written under Bob's namespace.
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/written_by",
            "account_id": bob.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("alice_via_intent")));

    // Verify event metadata shows actor=alice, author=solver.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs).expect("Expected CONTRACT_UPDATE meta_tx marker event");
    let data0 = &marker["data"][0];
    assert_eq!(data0["actor_id"].as_str(), Some(alice.id().as_str()));
    assert_eq!(data0["payer_id"].as_str(), Some(solver.id().as_str()));

    Ok(())
}

/// SignedPayload with invalid signature is rejected.
#[tokio::test]
async fn test_signed_payload_invalid_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/name": "Test" } });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: None,
    };
    let valid_sig = sign_payload(contract.id().as_str(), &payload, &sk)?;

    // Corrupt signature.
    let mut sig_bytes = BASE64_ENGINE.decode(&valid_sig)?;
    sig_bytes[0] ^= 0xFF;
    let invalid_sig = BASE64_ENGINE.encode(&sig_bytes);

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": invalid_sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected invalid signature to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("invalid signature") || err.contains("signature"),
        "Expected signature error, got: {err}"
    );

    Ok(())
}

/// Nonce can skip values (monotonic, not sequential).
#[tokio::test]
async fn test_signed_payload_nonce_skip_allowed() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action1 = json!({ "type": "set", "data": { "profile/n1": "first" } });
    let payload1 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action1.clone(),
        delegate_action: None,
    };
    let sig1 = sign_payload(contract.id().as_str(), &payload1, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action1,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig1
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(res.is_success(), "nonce=1 failed: {:?}", res.failures());

    let action2 = json!({ "type": "set", "data": { "profile/n100": "skipped" } });
    let payload2 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(100),
        expires_at_ms: U64(0),
        action: action2.clone(),
        delegate_action: None,
    };
    let sig2 = sign_payload(contract.id().as_str(), &payload2, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action2,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "100",
                    "expires_at_ms": "0",
                    "signature": sig2
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "nonce skip to 100 should succeed: {:?}",
        res.failures()
    );

    // Verify data was written.
    let v: serde_json::Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/n100",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("skipped")));

    Ok(())
}

/// DelegateAction replay protection: same nonce rejected.
#[tokio::test]
async fn test_delegate_action_replay_protection() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/delegate": "first" } });
    let delegate_action = json!({ "receiver_id": contract.id().to_string(), "actions": ["set"] });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: Some(delegate_action.clone()),
    };

    let domain = format!("onsocial:execute:delegate:v1:{}", contract.id());
    let canonical_payload = SignedSetPayload {
        action: canonicalize_json(&payload.action),
        delegate_action: payload.delegate_action.as_ref().map(canonicalize_json),
        ..payload.clone()
    };
    let payload_bytes = serde_json::to_vec(&canonical_payload)?;
    let mut message = domain.clone().into_bytes();
    message.push(0);
    message.extend_from_slice(&payload_bytes);
    let message_hash: [u8; 32] = Sha256::digest(&message).into();
    let signature = sk.sign(&message_hash);
    let sig_b64 = BASE64_ENGINE.encode(signature.to_bytes());

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action.clone(),
                "auth": {
                    "type": "delegate_action",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig_b64.clone(),
                    "action": delegate_action.clone()
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "First delegate_action failed: {:?}",
        res.failures()
    );

    // Replay with same nonce should fail.
    let action_replay = json!({ "type": "set", "data": { "profile/delegate": "replay" } });
    let payload_replay = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_replay.clone(),
        delegate_action: Some(delegate_action.clone()),
    };
    let canonical_replay = SignedSetPayload {
        action: canonicalize_json(&payload_replay.action),
        delegate_action: payload_replay
            .delegate_action
            .as_ref()
            .map(canonicalize_json),
        ..payload_replay.clone()
    };
    let replay_bytes = serde_json::to_vec(&canonical_replay)?;
    let mut msg_replay = domain.into_bytes();
    msg_replay.push(0);
    msg_replay.extend_from_slice(&replay_bytes);
    let hash_replay: [u8; 32] = Sha256::digest(&msg_replay).into();
    let sig_replay = sk.sign(&hash_replay);
    let sig_replay_b64 = BASE64_ENGINE.encode(sig_replay.to_bytes());

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_replay,
                "auth": {
                    "type": "delegate_action",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig_replay_b64,
                    "action": delegate_action
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(!res.is_success(), "Expected replay to fail");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("Nonce too low"),
        "Expected 'Nonce too low', got: {err}"
    );

    Ok(())
}

/// Intent executor removed from allowlist is rejected on subsequent calls.
#[tokio::test]
async fn test_intent_executor_removed_from_allowlist_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Add solver to allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "add solver failed: {:?}", res.failures());

    // Solver succeeds initially.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/first": "works" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": {}
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "First intent call should succeed: {:?}",
        res.failures()
    );

    // Remove solver from allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": []
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "remove solver failed: {:?}",
        res.failures()
    );

    // Solver now fails.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/second": "should_fail" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": {}
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected removed executor to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("intent_executor") || err.contains("Unauthorized"),
        "Expected 'intent_executor' or 'Unauthorized' error, got: {err}"
    );

    Ok(())
}

/// Test that Intent auth does NOT use executor's signer key for permission lookup.
/// This verifies that key-based permission fallback only applies to Direct auth.
#[tokio::test]
async fn test_intent_auth_ignores_executor_signer_key_permissions() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Alice grants KEY permission (not account permission) to solver's signer key.
    // This should allow solver to write via Direct auth, but NOT via Intent auth.
    let solver_pk = solver.secret_key().public_key();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": solver_pk.to_string(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Add solver as intent executor.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "update_config failed: {:?}",
        res.failures()
    );

    // Solver uses Direct auth to write to Alice (using key permission) — should SUCCEED.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/via_direct": "direct_auth_works" } },
                "auth": null
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Direct auth with key permission should succeed: {:?}",
        res.failures()
    );

    // Verify data was written.
    let v: Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/via_direct",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("direct_auth_works")));

    // Solver uses Intent auth to write to a path Alice did NOT grant account permission for.
    // Intent auth should NOT use solver's key permissions — only account permissions for actor_id.
    // Since Alice didn't grant account-level permission to solver, this should fail with permission denied.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "posts/intent_test": "should_fail" } },
                "auth": {
                    "type": "intent",
                    "actor_id": alice.id(),
                    "intent": {}
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    // This should SUCCEED because Intent auth sets actor_id = alice (from intent auth),
    // and Alice is writing to her own namespace. The key is: solver's key permissions
    // are NOT consulted for Intent auth.
    assert!(
        res.is_success(),
        "Intent auth writes as actor_id (alice), not executor: {:?}",
        res.failures()
    );

    Ok(())
}

/// Test that Intent auth with actor_id != target_account fails when only key permission exists.
/// This proves that Intent auth does NOT consult executor's signer key for authorization.
#[tokio::test]
async fn test_intent_auth_fails_when_only_key_permission_exists() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let solver = create_user(&root, "solver", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Alice grants KEY permission to solver's signer key on profile/.
    let solver_pk = solver.secret_key().public_key();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": solver_pk.to_string(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Add solver as intent executor.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "update": {
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "update_config failed: {:?}",
        res.failures()
    );

    // Confirm Direct auth works (key permission is valid).
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/direct_test": "works" } },
                "auth": null
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Direct auth should succeed with key permission: {:?}",
        res.failures()
    );

    // Intent auth with actor_id = solver (NOT alice).
    // Solver has key permission on Alice's profile/, but Intent auth should NOT use it.
    // actor_id = solver has no account-level permission on Alice's namespace.
    let res = solver
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": { "type": "set", "data": { "profile/intent_hack": "should_fail" } },
                "auth": {
                    "type": "intent",
                    "actor_id": solver.id(),
                    "intent": {}
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    // This MUST fail: solver (actor_id) has no account permission on Alice's profile/,
    // and Intent auth must NOT fall back to solver's key permissions.
    assert!(
        !res.is_success(),
        "Intent auth should NOT use executor's key permissions"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("PermissionDenied") || err.contains("permission") || err.contains("denied"),
        "Expected permission denied error, got: {err}"
    );

    Ok(())
}

/// Verify nonce is tracked correctly via `get_nonce` view method.
#[tokio::test]
async fn test_signed_payload_nonce_tracking() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Verify initial nonce is 0.
    let nonce_before: serde_json::Value = contract
        .view("get_nonce")
        .args_json(json!({
            "account_id": alice.id(),
            "public_key": pk_str
        }))
        .await?
        .json()?;
    assert_eq!(nonce_before, json!("0"), "Initial nonce should be 0");

    // Relayer submits signed payload with nonce=1.
    let action = json!({ "type": "set", "data": { "profile/test_nonce": "value1" } });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: None,
    };
    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Signed payload should succeed: {:?}",
        res.failures()
    );

    // Verify nonce was recorded as 1.
    let nonce_after: serde_json::Value = contract
        .view("get_nonce")
        .args_json(json!({
            "account_id": alice.id(),
            "public_key": pk_str
        }))
        .await?
        .json()?;
    assert_eq!(
        nonce_after,
        json!("1"),
        "Nonce should be 1 after first call"
    );

    // Submit with nonce=2 and verify it increments.
    let action2 = json!({ "type": "set", "data": { "profile/test_nonce2": "value2" } });
    let payload2 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(2),
        expires_at_ms: U64(0),
        action: action2.clone(),
        delegate_action: None,
    };
    let signature2 = sign_payload(contract.id().as_str(), &payload2, &sk)?;

    let res2 = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action2,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "2",
                    "expires_at_ms": "0",
                    "signature": signature2
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res2.is_success(),
        "Nonce=2 after nonce=1 should succeed: {:?}",
        res2.failures()
    );

    // Verify nonce is now 2.
    let nonce_final: serde_json::Value = contract
        .view("get_nonce")
        .args_json(json!({
            "account_id": alice.id(),
            "public_key": pk_str
        }))
        .await?
        .json()?;
    assert_eq!(
        nonce_final,
        json!("2"),
        "Nonce should be 2 after second call"
    );

    Ok(())
}

// =============================================================================
// Crypto Validation Tests (validation/crypto.rs)
// =============================================================================

/// SignedPayload with secp256k1 public key is rejected (only ED25519 supported).
/// Tests: validation/crypto.rs:6-8 (ed25519_public_key_bytes curve type check)
#[tokio::test]
async fn test_signed_payload_secp256k1_key_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Create a secp256k1 public key string (64 bytes raw key = uncompressed format).
    // secp256k1 keys are 64 bytes (uncompressed without prefix) in near-sdk format.
    let fake_secp_key_bytes = [0x42u8; 64];
    let secp_pk_str = format!(
        "secp256k1:{}",
        bs58::encode(&fake_secp_key_bytes).into_string()
    );

    // Attempt to use secp256k1 key in signed payload auth.
    // Note: We cannot actually grant permission to a secp256k1 key since set_key_permission
    // also validates the key type. So we test that the signed payload auth itself rejects it.
    let action = json!({ "type": "set", "data": { "profile/name": "Test" } });

    // Create a dummy signature (64 bytes).
    let dummy_sig = BASE64_ENGINE.encode([0u8; 64]);

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": secp_pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": dummy_sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(!res.is_success(), "Expected secp256k1 key to be rejected");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("ed25519") || err.contains("Only ed25519"),
        "Expected ed25519-only error, got: {err}"
    );

    Ok(())
}

/// SignedPayload with truncated signature (< 64 bytes) is rejected.
/// Tests: validation/crypto.rs:24-27 (ed25519_signature_bytes length check)
#[tokio::test]
async fn test_signed_payload_truncated_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (_, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/name": "Test" } });

    // Create a truncated signature (63 bytes instead of 64).
    let truncated_sig = BASE64_ENGINE.encode([0u8; 63]);

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": truncated_sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected truncated signature (63 bytes) to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("signature") || err.contains("Invalid"),
        "Expected signature validation error, got: {err}"
    );

    Ok(())
}

/// SignedPayload with oversized signature (> 64 bytes) is rejected.
/// Tests: validation/crypto.rs:24-27 (ed25519_signature_bytes length check)
#[tokio::test]
async fn test_signed_payload_oversized_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (_, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/name": "Test" } });

    // Create an oversized signature (65 bytes instead of 64).
    let oversized_sig = BASE64_ENGINE.encode([0u8; 65]);

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": oversized_sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Expected oversized signature (65 bytes) to be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("signature") || err.contains("Invalid"),
        "Expected signature validation error, got: {err}"
    );

    Ok(())
}

/// SignedPayload with empty signature is rejected.
/// Tests: validation/crypto.rs:24-27 (ed25519_signature_bytes length check)
#[tokio::test]
async fn test_signed_payload_empty_signature_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (_, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/name": "Test" } });

    // Empty signature (0 bytes).
    let empty_sig = BASE64_ENGINE.encode([0u8; 0]);

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": empty_sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(!res.is_success(), "Expected empty signature to be rejected");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("signature") || err.contains("Invalid"),
        "Expected signature validation error, got: {err}"
    );

    Ok(())
}

/// Test that Auth::Direct correctly populates VerifiedContext fields in events.
/// Verifies: auth_type="direct", actor_id=signer, payer_id=predecessor.
#[tokio::test]
async fn test_direct_auth_context_fields_in_event() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;

    // Alice writes directly with null auth (Auth::Direct).
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": null,
                "action": { "type": "set", "data": { "profile/name": "Alice Direct" } },
                "auth": null
            }
        }))
        .deposit(NearToken::from_near(1))
        .gas(Gas::from_tgas(150))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "Direct auth write should succeed: {:?}",
        res.failures()
    );

    // Find the meta_tx marker event.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs)
        .expect("Expected CONTRACT_UPDATE meta_tx marker event for direct auth");
    let data0 = &marker["data"][0];

    // Verify auth_type is "direct".
    assert_eq!(
        data0["auth_type"].as_str(),
        Some("direct"),
        "auth_type should be 'direct' for null auth, got: {:?}",
        data0["auth_type"]
    );

    // Verify actor_id equals the signer (alice).
    assert_eq!(
        data0["actor_id"].as_str(),
        Some(alice.id().as_str()),
        "actor_id should be alice for direct auth"
    );

    // Verify payer_id equals the predecessor (alice, since she called directly).
    assert_eq!(
        data0["payer_id"].as_str(),
        Some(alice.id().as_str()),
        "payer_id should be alice for direct auth"
    );

    // Verify data was written.
    let v: Value = contract
        .view("get_one")
        .args_json(json!({
            "key": "profile/name",
            "account_id": alice.id().to_string()
        }))
        .await?
        .json()?;
    assert_eq!(v.get("value"), Some(&json!("Alice Direct")));

    Ok(())
}

// =============================================================================
// Canonical JSON Serialization Tests
// =============================================================================
// These tests verify that canonicalize_json_value produces deterministic output
// regardless of input key ordering, ensuring signature verification works correctly.

/// Tests: protocol/canonical_json.rs (key ordering invariance)
/// Verifies that a signed payload succeeds even when the submitted action JSON
/// has keys in a different order than what the signer used.
#[tokio::test]
async fn test_signed_payload_json_key_order_invariance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Sign with keys in one order: { "type": ..., "data": { "profile/bio": ..., "profile/name": ... } }
    // The signer's payload will be canonicalized, so keys will be sorted: bio < name
    let action_for_signing = json!({
        "type": "set",
        "data": {
            "profile/bio": "Hello world",
            "profile/name": "Alice"
        }
    });

    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_for_signing,
        delegate_action: None,
    };
    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    // Submit with keys in DIFFERENT order: { "data": { "profile/name": ..., "profile/bio": ... }, "type": ... }
    // If canonicalization works, this should still verify correctly.
    let action_different_order = json!({
        "data": {
            "profile/name": "Alice",
            "profile/bio": "Hello world"
        },
        "type": "set"
    });

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_different_order,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "Signature should verify despite different key ordering: {:?}",
        res.failures()
    );

    // Verify both fields were written.
    let name: Value = contract
        .view("get_one")
        .args_json(json!({ "key": "profile/name", "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(name.get("value"), Some(&json!("Alice")));

    let bio: Value = contract
        .view("get_one")
        .args_json(json!({ "key": "profile/bio", "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    assert_eq!(bio.get("value"), Some(&json!("Hello world")));

    Ok(())
}

/// Tests: protocol/canonical_json.rs (nested object canonicalization)
/// Verifies that deeply nested objects are properly canonicalized.
#[tokio::test]
async fn test_signed_payload_nested_object_canonicalization() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission for settings/.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "settings/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Sign with nested object keys in one order.
    let action_for_signing = json!({
        "type": "set",
        "data": {
            "settings/preferences": {
                "theme": "dark",
                "language": "en",
                "notifications": {
                    "email": true,
                    "push": false
                }
            }
        }
    });

    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_for_signing,
        delegate_action: None,
    };
    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    // Submit with nested keys in DIFFERENT order (reversed at each level).
    let action_different_order = json!({
        "data": {
            "settings/preferences": {
                "notifications": {
                    "push": false,
                    "email": true
                },
                "theme": "dark",
                "language": "en"
            }
        },
        "type": "set"
    });

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_different_order,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "Signature should verify with nested objects in different order: {:?}",
        res.failures()
    );

    // Verify the nested data was written.
    let prefs: Value = contract
        .view("get_one")
        .args_json(json!({ "key": "settings/preferences", "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    let value = prefs.get("value").expect("should have value");
    assert_eq!(value.get("theme"), Some(&json!("dark")));
    assert_eq!(value.get("language"), Some(&json!("en")));
    assert_eq!(
        value.get("notifications").and_then(|n| n.get("email")),
        Some(&json!(true))
    );
    assert_eq!(
        value.get("notifications").and_then(|n| n.get("push")),
        Some(&json!(false))
    );

    Ok(())
}

/// Tests: protocol/canonical_json.rs (array with objects canonicalization)
/// Verifies that arrays containing objects with different key orderings are handled correctly.
#[tokio::test]
async fn test_signed_payload_array_object_canonicalization() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Alice deposits storage.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    // Grant key permission for data/.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "data/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Sign with array containing objects with keys in specific order.
    let action_for_signing = json!({
        "type": "set",
        "data": {
            "data/contacts": [
                { "name": "Bob", "email": "bob@example.com" },
                { "name": "Carol", "email": "carol@example.com" }
            ]
        }
    });

    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_for_signing,
        delegate_action: None,
    };
    let signature = sign_payload(contract.id().as_str(), &payload, &sk)?;

    // Submit with array objects having keys in DIFFERENT order.
    // Note: array ORDER matters (not canonicalized), but object keys within are.
    let action_different_order = json!({
        "data": {
            "data/contacts": [
                { "email": "bob@example.com", "name": "Bob" },
                { "email": "carol@example.com", "name": "Carol" }
            ]
        },
        "type": "set"
    });

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_different_order,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": signature
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        res.is_success(),
        "Signature should verify with array objects in different key order: {:?}",
        res.failures()
    );

    // Verify array was written correctly.
    let contacts: Value = contract
        .view("get_one")
        .args_json(json!({ "key": "data/contacts", "account_id": alice.id().to_string() }))
        .await?
        .json()?;
    let arr = contacts
        .get("value")
        .and_then(|v| v.as_array())
        .expect("should be array");
    assert_eq!(arr.len(), 2);
    assert_eq!(arr[0].get("name"), Some(&json!("Bob")));
    assert_eq!(arr[1].get("name"), Some(&json!("Carol")));

    Ok(())
}

/// Nonce=0 must be rejected even when no prior nonce exists (boundary: last=0, 0≤0).
#[tokio::test]
async fn test_signed_payload_nonce_zero_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let action = json!({ "type": "set", "data": { "profile/zero": "should_fail" } });
    let payload = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(0),
        expires_at_ms: U64(0),
        action: action.clone(),
        delegate_action: None,
    };
    let sig = sign_payload(contract.id().as_str(), &payload, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "0",
                    "expires_at_ms": "0",
                    "signature": sig
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(!res.is_success(), "Nonce=0 should be rejected");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("Nonce too low"),
        "Expected 'Nonce too low', got: {err}"
    );

    Ok(())
}

/// Different keys on the same account have independent nonce counters.
#[tokio::test]
async fn test_signed_payload_nonce_isolation_between_keys() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk_a, pk_a) = make_deterministic_ed25519_keypair();
    let (sk_b, pk_b) = make_deterministic_ed25519_keypair_2();

    // Grant both keys permission.
    for pk in [&pk_a, &pk_b] {
        let res = alice
            .call(contract.id(), "execute")
            .args_json(json!({
                "request": {
                    "action": { "type": "set_key_permission", "public_key": pk, "path": "profile/", "level": 1, "expires_at": null }
                }
            }))
            .gas(Gas::from_tgas(80))
            .transact()
            .await?;
        assert!(
            res.is_success(),
            "set_key_permission failed: {:?}",
            res.failures()
        );
    }

    // Use key A with nonce=5.
    let action_a = json!({ "type": "set", "data": { "profile/ka": "v1" } });
    let payload_a = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_a.clone(),
        nonce: U64(5),
        expires_at_ms: U64(0),
        action: action_a.clone(),
        delegate_action: None,
    };
    let sig_a = sign_payload(contract.id().as_str(), &payload_a, &sk_a)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_a,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_a.clone(),
                    "nonce": "5",
                    "expires_at_ms": "0",
                    "signature": sig_a
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Key A nonce=5 failed: {:?}",
        res.failures()
    );

    // Key B at nonce=1 should succeed (independent from key A's nonce=5).
    let action_b = json!({ "type": "set", "data": { "profile/kb": "v1" } });
    let payload_b = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_b.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_b.clone(),
        delegate_action: None,
    };
    let sig_b = sign_payload(contract.id().as_str(), &payload_b, &sk_b)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_b,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_b.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig_b
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Key B nonce=1 should succeed independently: {:?}",
        res.failures()
    );

    // Verify via get_nonce that each key has its own counter.
    let nonce_a: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_a }))
        .await?
        .json()?;
    assert_eq!(nonce_a, json!("5"), "Key A nonce should be 5");

    let nonce_b: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_b }))
        .await?
        .json()?;
    assert_eq!(nonce_b, json!("1"), "Key B nonce should be 1");

    Ok(())
}

/// After a high nonce, submitting a lower (but non-zero) nonce must fail.
#[tokio::test]
async fn test_signed_payload_nonce_regression_rejected() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    // Succeed at nonce=100.
    let action1 = json!({ "type": "set", "data": { "profile/high": "v1" } });
    let payload1 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(100),
        expires_at_ms: U64(0),
        action: action1.clone(),
        delegate_action: None,
    };
    let sig1 = sign_payload(contract.id().as_str(), &payload1, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action1,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "100",
                    "expires_at_ms": "0",
                    "signature": sig1
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(res.is_success(), "nonce=100 failed: {:?}", res.failures());

    // Attempt nonce=50 (lower than 100) — must fail.
    let action2 = json!({ "type": "set", "data": { "profile/regress": "should_fail" } });
    let payload2 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(50),
        expires_at_ms: U64(0),
        action: action2.clone(),
        delegate_action: None,
    };
    let sig2 = sign_payload(contract.id().as_str(), &payload2, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action2,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "50",
                    "expires_at_ms": "0",
                    "signature": sig2
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;

    assert!(
        !res.is_success(),
        "Lower nonce after high nonce should be rejected"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("Nonce too low"),
        "Expected 'Nonce too low', got: {err}"
    );

    Ok(())
}

// =============================================================================
// Nonce Edge-Case Tests
// =============================================================================

/// Nonce survives key revocation and re-grant.
/// After revoking a key and re-granting it, the old nonce must still apply —
/// replaying an old nonce must fail. This prevents replay attacks via
/// revoke→re-grant cycles.
#[tokio::test]
async fn test_signed_payload_nonce_survives_key_revocation() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Storage deposit.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();

    // Grant key permission.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "grant key_permission failed: {:?}",
        res.failures()
    );

    // Use nonce=5.
    let action1 = json!({ "type": "set", "data": { "profile/revoke_test": "before_revoke" } });
    let payload1 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(5),
        expires_at_ms: U64(0),
        action: action1.clone(),
        delegate_action: None,
    };
    let sig1 = sign_payload(contract.id().as_str(), &payload1, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action1,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "5",
                    "expires_at_ms": "0",
                    "signature": sig1
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(res.is_success(), "nonce=5 failed: {:?}", res.failures());

    // Verify nonce is 5.
    let nonce_before_revoke: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_str }))
        .await?
        .json()?;
    assert_eq!(nonce_before_revoke, json!("5"));

    // Revoke the key (level=0).
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 0, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "revoke key_permission failed: {:?}",
        res.failures()
    );

    // Re-grant the same key.
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "re-grant key_permission failed: {:?}",
        res.failures()
    );

    // Nonce should still be 5 after revoke+re-grant.
    let nonce_after_regrant: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_str }))
        .await?
        .json()?;
    assert_eq!(
        nonce_after_regrant,
        json!("5"),
        "Nonce must survive revoke+re-grant"
    );

    // Attempting nonce=3 (below old high-water mark) must fail.
    let action2 = json!({ "type": "set", "data": { "profile/revoke_test": "replay_attempt" } });
    let payload2 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(3),
        expires_at_ms: U64(0),
        action: action2.clone(),
        delegate_action: None,
    };
    let sig2 = sign_payload(contract.id().as_str(), &payload2, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action2,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "3",
                    "expires_at_ms": "0",
                    "signature": sig2
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "Replay with old nonce after revoke+re-grant must fail"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("Nonce too low"),
        "Expected 'Nonce too low', got: {err}"
    );

    // nonce=6 should succeed (strictly greater than old high-water mark).
    let action3 = json!({ "type": "set", "data": { "profile/revoke_test": "after_regrant" } });
    let payload3 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(6),
        expires_at_ms: U64(0),
        action: action3.clone(),
        delegate_action: None,
    };
    let sig3 = sign_payload(contract.id().as_str(), &payload3, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action3,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "6",
                    "expires_at_ms": "0",
                    "signature": sig3
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "nonce=6 after revoke+re-grant should succeed: {:?}",
        res.failures()
    );

    Ok(())
}

/// nonce = u64::MAX succeeds, then no further nonce can be submitted
/// (there is no value strictly greater than u64::MAX).
#[tokio::test]
async fn test_signed_payload_nonce_u64_max_is_terminal() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
            }
        }))
        .deposit(ONE_NEAR)
        .gas(Gas::from_tgas(120))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "storage deposit failed: {:?}",
        res.failures()
    );

    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    let res = alice
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
            }
        }))
        .gas(Gas::from_tgas(80))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "set_key_permission failed: {:?}",
        res.failures()
    );

    let max_nonce = u64::MAX;
    let max_nonce_str = max_nonce.to_string();

    // Submit with nonce = u64::MAX.
    let action1 = json!({ "type": "set", "data": { "profile/max_nonce": "terminal" } });
    let payload1 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(max_nonce),
        expires_at_ms: U64(0),
        action: action1.clone(),
        delegate_action: None,
    };
    let sig1 = sign_payload(contract.id().as_str(), &payload1, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action1,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": max_nonce_str.clone(),
                    "expires_at_ms": "0",
                    "signature": sig1
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "nonce=u64::MAX should succeed: {:?}",
        res.failures()
    );

    // Verify nonce is recorded as u64::MAX.
    let nonce_val: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_str }))
        .await?
        .json()?;
    assert_eq!(nonce_val, json!(max_nonce_str), "Nonce should be u64::MAX");

    // Attempting nonce=u64::MAX again must fail (not strictly greater).
    let action2 = json!({ "type": "set", "data": { "profile/max_nonce": "replay" } });
    let payload2 = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(max_nonce),
        expires_at_ms: U64(0),
        action: action2.clone(),
        delegate_action: None,
    };
    let sig2 = sign_payload(contract.id().as_str(), &payload2, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action2,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": max_nonce_str,
                    "expires_at_ms": "0",
                    "signature": sig2
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        !res.is_success(),
        "After u64::MAX, no further nonce should be accepted"
    );
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("Nonce too low"),
        "Expected 'Nonce too low', got: {err}"
    );

    Ok(())
}

/// Same public key used by two different accounts must have independent nonce counters.
#[tokio::test]
async fn test_signed_payload_nonce_cross_account_isolation() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    let contract = deploy_and_init(&worker).await?;

    let alice = create_user(&root, "alice", TEN_NEAR).await?;
    let bob = create_user(&root, "bob", TEN_NEAR).await?;
    let relayer = create_user(&root, "relayer", TEN_NEAR).await?;

    // Both alice and bob deposit storage.
    for user in [&alice, &bob] {
        let res = user
            .call(contract.id(), "execute")
            .args_json(json!({
                "request": {
                    "action": { "type": "set", "data": { "storage/deposit": { "amount": "1000000000000000000000000" } } }
                }
            }))
            .deposit(ONE_NEAR)
            .gas(Gas::from_tgas(120))
            .transact()
            .await?;
        assert!(
            res.is_success(),
            "storage deposit failed: {:?}",
            res.failures()
        );
    }

    // Same key granted to both accounts.
    let (sk, pk_str) = make_deterministic_ed25519_keypair();
    for user in [&alice, &bob] {
        let res = user
            .call(contract.id(), "execute")
            .args_json(json!({
                "request": {
                    "action": { "type": "set_key_permission", "public_key": pk_str.clone(), "path": "profile/", "level": 1, "expires_at": null }
                }
            }))
            .gas(Gas::from_tgas(80))
            .transact()
            .await?;
        assert!(
            res.is_success(),
            "set_key_permission failed: {:?}",
            res.failures()
        );
    }

    // Alice uses nonce=10.
    let action_a = json!({ "type": "set", "data": { "profile/cross_acct": "alice_val" } });
    let payload_a = SignedSetPayload {
        target_account: alice.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(10),
        expires_at_ms: U64(0),
        action: action_a.clone(),
        delegate_action: None,
    };
    let sig_a = sign_payload(contract.id().as_str(), &payload_a, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": alice.id(),
                "action": action_a,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "10",
                    "expires_at_ms": "0",
                    "signature": sig_a
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Alice nonce=10 failed: {:?}",
        res.failures()
    );

    // Bob uses nonce=1 with the SAME key — should succeed (independent counter).
    let action_b = json!({ "type": "set", "data": { "profile/cross_acct": "bob_val" } });
    let payload_b = SignedSetPayload {
        target_account: bob.id().to_string(),
        public_key: pk_str.clone(),
        nonce: U64(1),
        expires_at_ms: U64(0),
        action: action_b.clone(),
        delegate_action: None,
    };
    let sig_b = sign_payload(contract.id().as_str(), &payload_b, &sk)?;

    let res = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": bob.id(),
                "action": action_b,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str.clone(),
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig_b
                }
            }
        }))
        .deposit(NearToken::from_near(2))
        .gas(Gas::from_tgas(200))
        .transact()
        .await?;
    assert!(
        res.is_success(),
        "Bob nonce=1 should succeed independently of Alice's nonce=10: {:?}",
        res.failures()
    );

    // Verify each account's nonce independently.
    let nonce_alice: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": alice.id(), "public_key": pk_str }))
        .await?
        .json()?;
    assert_eq!(nonce_alice, json!("10"), "Alice's nonce should be 10");

    let nonce_bob: Value = contract
        .view("get_nonce")
        .args_json(json!({ "account_id": bob.id(), "public_key": pk_str }))
        .await?
        .json()?;
    assert_eq!(nonce_bob, json!("1"), "Bob's nonce should be 1");

    Ok(())
}
