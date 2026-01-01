use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::json;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{testing_env, AccountId, NearToken};

use ed25519_dalek::{Signer, SigningKey};

use crate::tests::test_utils::{get_context_with_deposit, init_live_contract, test_account, TEST_BASE_TIMESTAMP};
use crate::protocol::set::signed_payload::SignedSetPayload;
use crate::{Auth, SetRequest};

fn set_context(builder: VMContextBuilder) {
    testing_env!(builder.build());
}

fn make_ed25519_keypair() -> (SigningKey, crate::PublicKey) {
    // Deterministic key for stable tests.
    let sk = SigningKey::from_bytes(&[7u8; 32]);
    let pk_bytes = sk.verifying_key().to_bytes();

    // near-sdk PublicKey JSON format uses base58 for raw key bytes.
    let pk_str = format!("ed25519:{}", bs58::encode(pk_bytes).into_string());
    let pk: crate::PublicKey = pk_str.parse().expect("valid near PublicKey");

    (sk, pk)
}

fn sign_payload(contract_id: &AccountId, payload: &SignedSetPayload, sk: &SigningKey) -> Base64VecU8 {
    let domain = format!("onsocial:set:v1:{}", contract_id);
    let payload = SignedSetPayload {
        action: payload
            .action
            .as_ref()
            .map(crate::protocol::set::canonical_json::canonicalize_json_value),
        data: crate::protocol::set::canonical_json::canonicalize_json_value(&payload.data),
        ..payload.clone()
    };
    let payload_bytes = near_sdk::serde_json::to_vec(&payload).expect("payload JSON");

    let mut message = domain.into_bytes();
    message.push(0);
    message.extend_from_slice(&payload_bytes);

    let message_hash = near_sdk::env::sha256_array(&message);
    let signature = sk.sign(&message_hash);

    Base64VecU8(signature.to_bytes().to_vec())
}

#[test]
fn signed_payload_happy_path_writes_data() {
    let alice = test_account(0);
    let relayer = test_account(1);

    // Setup contract in Live mode.
    let mut contract = init_live_contract();

    // Create deterministic key and grant it WRITE under alice's profile subtree.
    let (_sk, pk) = make_ed25519_keypair();

    // alice grants permissions (direct call context).
    let alice_storage_deposit = NearToken::from_near(1).as_yoctonear();
    set_context(get_context_with_deposit(alice.clone(), alice_storage_deposit));
    contract
        .set(SetRequest {
            target_account: None,
            data: json!({
                "storage/deposit": {"amount": alice_storage_deposit.to_string()}
            }),
            options: None,
            
            auth: None,
        })
        .expect("storage deposit for alice");
    contract
        .set_key_permission(pk.clone(), "profile".to_string(), crate::groups::kv_permissions::WRITE, None)
        .expect("grant key permission");

    // Relayer submits signed payload with deposit to cover storage.
    let deposit = 2 * 10u128.pow(24); // 2 NEAR (test-only, comfortably above typical costs)
    let mut ctx = get_context_with_deposit(relayer.clone(), deposit);
    ctx.signer_account_id(relayer.clone());
    ctx.predecessor_account_id(relayer.clone());
    // Ensure contract ID matches domain separation.
    let contract_id = near_sdk::test_utils::accounts(0);
    ctx.current_account_id(contract_id.clone());
    // block_timestamp is in ns; signed payload uses env::block_timestamp_ms.
    ctx.block_timestamp(TEST_BASE_TIMESTAMP);

    // Recreate signing key for signature.
    let sk = SigningKey::from_bytes(&[7u8; 32]);

    let payload = SignedSetPayload {
        target_account: alice.clone(),
        public_key: pk.clone(),
        nonce: U64(1),
        expires_at_ms: U64(TEST_BASE_TIMESTAMP / 1_000_000 + 60_000), // +60s
        action: None,
        data: json!({
            "profile/name": "Alice"
        }),
        options: None,
        
    };

    let signature = {
        set_context(ctx);
        sign_payload(&contract_id, &payload, &sk)
    };

    // Execute under the same context used for signing (contract_id, timestamp, etc).
    let req = SetRequest {
        target_account: Some(alice.clone()),
        data: payload.data.clone(),
        options: None,
        
        auth: Some(Auth::SignedPayload {
            public_key: pk,
            nonce: U64(1),
            expires_at_ms: U64(TEST_BASE_TIMESTAMP / 1_000_000 + 60_000),
            signature,
        }),
    };

    contract.set(req).expect("set signed payload ok");

    // Verify data written.
    let got = contract.get_one("profile/name".to_string(), Some(alice.clone()));
    assert_eq!(got.value, Some(json!("Alice")));
}

#[test]
fn signed_payload_rejects_replay_nonce() {
    let alice = test_account(0);
    let relayer = test_account(1);

    let mut contract = init_live_contract();

    let (_sk, pk) = make_ed25519_keypair();
    let alice_storage_deposit = NearToken::from_near(1).as_yoctonear();
    set_context(get_context_with_deposit(alice.clone(), alice_storage_deposit));
    contract
        .set(SetRequest {
            target_account: None,
            data: json!({
                "storage/deposit": {"amount": alice_storage_deposit.to_string()}
            }),
            options: None,
            
            auth: None,
        })
        .expect("storage deposit for alice");
    contract
        .set_key_permission(pk.clone(), "profile".to_string(), crate::groups::kv_permissions::WRITE, None)
        .expect("grant key permission");

    let deposit = NearToken::from_yoctonear(2 * 10u128.pow(24));
    let mut ctx = VMContextBuilder::new();
    let contract_id = near_sdk::test_utils::accounts(0);
    ctx.current_account_id(contract_id.clone())
        .signer_account_id(relayer.clone())
        .predecessor_account_id(relayer.clone())
        .block_timestamp(TEST_BASE_TIMESTAMP)
        .attached_deposit(deposit);

    let sk = SigningKey::from_bytes(&[7u8; 32]);

    let payload = SignedSetPayload {
        target_account: alice.clone(),
        public_key: pk.clone(),
        nonce: U64(1),
        expires_at_ms: U64(TEST_BASE_TIMESTAMP / 1_000_000 + 60_000),
        action: None,
        data: json!({ "profile/name": "Alice" }),
        options: None,
        
    };

    set_context(ctx);
    let sig1 = sign_payload(&contract_id, &payload, &sk);
    let req1 = SetRequest {
        target_account: Some(alice.clone()),
        data: payload.data.clone(),
        options: None,
        
        auth: Some(Auth::SignedPayload {
            public_key: pk.clone(),
            nonce: U64(1),
            expires_at_ms: payload.expires_at_ms,
            signature: sig1,
        }),
    };
    contract.set(req1).expect("first ok");

    let sig2 = sign_payload(&contract_id, &payload, &sk);
    let req2 = SetRequest {
        target_account: Some(alice.clone()),
        data: payload.data.clone(),
        options: None,
        
        auth: Some(Auth::SignedPayload {
            public_key: pk,
            nonce: U64(1),
            expires_at_ms: payload.expires_at_ms,
            signature: sig2,
        }),
    };

    let err = contract.set(req2).expect_err("second should fail");

    let msg = format!("{err:?}");
    assert!(msg.contains("Nonce too low"), "unexpected error: {msg}");
}

#[test]
fn signed_payload_rejects_expired() {
    let alice = test_account(0);
    let relayer = test_account(1);

    let mut contract = init_live_contract();

    let (_sk, pk) = make_ed25519_keypair();
    let alice_storage_deposit = NearToken::from_near(1).as_yoctonear();
    set_context(get_context_with_deposit(alice.clone(), alice_storage_deposit));
    contract
        .set(SetRequest {
            target_account: None,
            data: json!({
                "storage/deposit": {"amount": alice_storage_deposit.to_string()}
            }),
            options: None,
            
            auth: None,
        })
        .expect("storage deposit for alice");
    contract
        .set_key_permission(pk.clone(), "profile".to_string(), crate::groups::kv_permissions::WRITE, None)
        .expect("grant key permission");

    let mut ctx = VMContextBuilder::new();
    let contract_id = near_sdk::test_utils::accounts(0);
    ctx.current_account_id(contract_id.clone())
        .signer_account_id(relayer.clone())
        .predecessor_account_id(relayer.clone())
        .block_timestamp(TEST_BASE_TIMESTAMP)
        .attached_deposit(NearToken::from_yoctonear(1 * 10u128.pow(24)));

    let sk = SigningKey::from_bytes(&[7u8; 32]);

    // Expired in ms relative to block_timestamp_ms.
    let expired_ms = TEST_BASE_TIMESTAMP / 1_000_000 - 1;
    let payload = SignedSetPayload {
        target_account: alice,
        public_key: pk.clone(),
        nonce: U64(1),
        expires_at_ms: U64(expired_ms),
        action: None,
        data: json!({ "profile/name": "Alice" }),
        options: None,
        
    };

    set_context(ctx);
    let sig = sign_payload(&contract_id, &payload, &sk);

    let req = SetRequest {
        target_account: Some(payload.target_account.clone()),
        data: payload.data.clone(),
        options: None,
        
        auth: Some(Auth::SignedPayload {
            public_key: pk,
            nonce: U64(1),
            expires_at_ms: payload.expires_at_ms,
            signature: sig,
        }),
    };

    let err = contract.set(req).expect_err("expired should fail");

    let msg = format!("{err:?}");
    assert!(msg.contains("Signed payload expired"), "unexpected error: {msg}");
}

#[test]
fn signed_payload_rejects_bad_signature() {
    let alice = test_account(0);
    let relayer = test_account(1);

    let mut contract = init_live_contract();

    let (_sk, pk) = make_ed25519_keypair();
    let alice_storage_deposit = NearToken::from_near(1).as_yoctonear();
    set_context(get_context_with_deposit(alice.clone(), alice_storage_deposit));
    contract
        .set(SetRequest {
            target_account: None,
            data: json!({
                "storage/deposit": {"amount": alice_storage_deposit.to_string()}
            }),
            options: None,
            
            auth: None,
        })
        .expect("storage deposit for alice");
    contract
        .set_key_permission(pk.clone(), "profile".to_string(), crate::groups::kv_permissions::WRITE, None)
        .expect("grant key permission");

    let mut ctx = VMContextBuilder::new();
    let contract_id = near_sdk::test_utils::accounts(0);
    ctx.current_account_id(contract_id.clone())
        .signer_account_id(relayer.clone())
        .predecessor_account_id(relayer)
        .block_timestamp(TEST_BASE_TIMESTAMP)
        .attached_deposit(NearToken::from_yoctonear(1 * 10u128.pow(24)));

    // Sign with a different key than payload.public_key.
    let sk_wrong = SigningKey::from_bytes(&[9u8; 32]);

    let payload = SignedSetPayload {
        target_account: alice,
        public_key: pk.clone(),
        nonce: U64(1),
        expires_at_ms: U64(TEST_BASE_TIMESTAMP / 1_000_000 + 60_000),
        action: None,
        data: json!({ "profile/name": "Alice" }),
        options: None,
        
    };

    set_context(ctx);
    let sig = sign_payload(&contract_id, &payload, &sk_wrong);

    let req = SetRequest {
        target_account: Some(payload.target_account.clone()),
        data: payload.data.clone(),
        options: None,
        
        auth: Some(Auth::SignedPayload {
            public_key: pk,
            nonce: U64(1),
            expires_at_ms: payload.expires_at_ms,
            signature: sig,
        }),
    };

    let err = contract.set(req).expect_err("bad signature should fail");

    let msg = format!("{err:?}");
    assert!(msg.contains("invalid signature") || msg.contains("permission denied"), "unexpected error: {msg}");
}
