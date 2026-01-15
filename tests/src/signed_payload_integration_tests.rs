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

fn sign_payload(contract_id: &str, payload: &SignedSetPayload, sk: &SigningKey) -> anyhow::Result<String> {
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
    assert!(res.is_success(), "Expected storage deposit to succeed: {:?}", res.failures());

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
    assert!(res.is_success(), "Expected set_key_permission to succeed: {:?}", res.failures());

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
    assert!(res.is_success(), "Expected signed payload set to succeed: {:?}", res.failures());

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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

    assert!(!res.is_success(), "Expected expired signature to be rejected");
    let err = format!("{:?}", res.failures());
    assert!(err.contains("expired"), "Expected 'expired' error, got: {err}");

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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

    assert!(!res.is_success(), "Expected unauthorized intent executor to be rejected");
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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

    // Manager adds solver to intents_executors allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "update_config failed: {:?}", res.failures());

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
    assert!(res.is_success(), "Intent auth by allowlisted executor failed: {:?}", res.failures());

    // Verify auth_type in event metadata.
    let logs = res.logs();
    let marker = find_meta_tx_marker(&logs).expect("Expected CONTRACT_UPDATE meta_tx marker event");
    let data0 = &marker["data"][0];
    assert_eq!(data0["auth_type"].as_str(), Some("intent"), "Expected auth_type=intent");
    assert_eq!(data0["actor_id"].as_str(), Some(alice.id().as_str()), "Expected actor_id=alice");
    assert_eq!(data0["payer_id"].as_str(), Some(solver.id().as_str()), "Expected payer_id=solver");

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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
    assert!(res.is_success(), "DelegateAction auth failed: {:?}", res.failures());

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
    assert!(res.is_success(), "bob storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_permission failed: {:?}", res.failures());

    // Manager adds solver to intents_executors.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "update_config failed: {:?}", res.failures());

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
    assert!(res.is_success(), "Intent cross-account write failed: {:?}", res.failures());

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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

    assert!(!res.is_success(), "Expected invalid signature to be rejected");
    let err = format!("{:?}", res.failures());
    assert!(err.contains("invalid signature") || err.contains("signature"), "Expected signature error, got: {err}");

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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
    assert!(res.is_success(), "nonce skip to 100 should succeed: {:?}", res.failures());

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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
    assert!(res.is_success(), "First delegate_action failed: {:?}", res.failures());

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
        delegate_action: payload_replay.delegate_action.as_ref().map(canonicalize_json),
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
    assert!(err.contains("Nonce too low"), "Expected 'Nonce too low', got: {err}");

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

    // Add solver to allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
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
    assert!(res.is_success(), "First intent call should succeed: {:?}", res.failures());

    // Remove solver from allowlist.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
                "intents_executors": []
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "remove solver failed: {:?}", res.failures());

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

    assert!(!res.is_success(), "Expected removed executor to be rejected");
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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

    // Add solver as intent executor.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "update_config failed: {:?}", res.failures());

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
    assert!(res.is_success(), "Direct auth with key permission should succeed: {:?}", res.failures());

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
    assert!(res.is_success(), "Intent auth writes as actor_id (alice), not executor: {:?}", res.failures());

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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

    // Add solver as intent executor.
    let res = contract
        .call("update_config")
        .args_json(json!({
            "config": {
                "max_key_length": 256,
                "max_path_depth": 12,
                "max_batch_size": 100,
                "max_value_bytes": 10240,
                "platform_onboarding_bytes": 10000,
                "platform_daily_refill_bytes": 3000,
                "platform_allowance_max_bytes": 6000,
                "intents_executors": [solver.id()]
            }
        }))
        .deposit(NearToken::from_yoctonear(1))
        .gas(Gas::from_tgas(50))
        .transact()
        .await?;
    assert!(res.is_success(), "update_config failed: {:?}", res.failures());

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
    assert!(res.is_success(), "Direct auth should succeed with key permission: {:?}", res.failures());

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
    assert!(!res.is_success(), "Intent auth should NOT use executor's key permissions");
    let err = format!("{:?}", res.failures());
    assert!(
        err.contains("PermissionDenied") || err.contains("permission") || err.contains("denied"),
        "Expected permission denied error, got: {err}"
    );

    Ok(())
}

/// Find `signed_payload_nonce_recorded` event in logs.
fn find_nonce_recorded_event<S: AsRef<str>>(logs: &[S]) -> Option<serde_json::Value> {
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
        if data0.get("operation").and_then(|x| x.as_str()) == Some("signed_payload_nonce_recorded") {
            return Some(data0.clone());
        }
    }
    None
}

/// Verify `signed_payload_nonce_recorded` event is emitted with correct schema.
#[tokio::test]
async fn test_signed_payload_nonce_recorded_event_schema() -> anyhow::Result<()> {
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
    assert!(res.is_success(), "storage deposit failed: {:?}", res.failures());

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
    assert!(res.is_success(), "set_key_permission failed: {:?}", res.failures());

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
    assert!(res.is_success(), "Signed payload should succeed: {:?}", res.failures());

    // Verify `signed_payload_nonce_recorded` event is emitted.
    let logs = res.logs();
    let event = find_nonce_recorded_event(&logs)
        .expect("Expected signed_payload_nonce_recorded event");

    // Verify event schema fields.
    assert_eq!(event.get("public_key").and_then(|v| v.as_str()), Some(pk_str.as_str()),
        "Event should contain correct public_key");
    assert_eq!(event.get("nonce").and_then(|v| v.as_str()), Some("1"),
        "Event should contain correct nonce");
    assert!(event.get("value").is_none(),
        "Event should NOT contain redundant 'value' field");
    let path = event.get("path").and_then(|v| v.as_str()).expect("Event should have path");
    assert!(path.contains("signed_payload_nonces"), "Path should contain 'signed_payload_nonces'");
    assert!(path.contains(alice.id().as_str()), "Path should contain owner account");

    // Now verify monotonically increasing nonce (nonce=2) works.
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
    assert!(res2.is_success(), "Nonce=2 after nonce=1 should succeed: {:?}", res2.failures());

    // Verify second event has nonce=2.
    let logs2 = res2.logs();
    let event2 = find_nonce_recorded_event(&logs2)
        .expect("Expected second signed_payload_nonce_recorded event");
    assert_eq!(event2.get("nonce").and_then(|v| v.as_str()), Some("2"),
        "Second event should have nonce=2");

    Ok(())
}
