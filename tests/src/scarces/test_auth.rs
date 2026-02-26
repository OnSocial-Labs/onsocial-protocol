// =============================================================================
// Auth Integration Tests — SignedPayload, DelegateAction, Intent
// =============================================================================
// Covers non-direct auth modes flowing through the scarces `execute()` entry
// point. These tests verify that the shared `onsocial_auth::authenticate()`
// layer works correctly with scarces-specific domain prefix, nonce prefix,
// action dispatch, confirmation gating, and relayer gasless patterns.
//
// Auth modes tested:
//   - Auth::SignedPayload  — off-chain ed25519 signature, relayer submits
//   - Auth::DelegateAction — signed payload with nested delegation
//   - Auth::Intent         — allowlisted executor acts on behalf of user
//   - Gasless purchase     — relayer + prepaid balance (draw_user_balance)
//   - Confirmation bypass  — signed auth skips 1-yoctoNEAR wallet gate

use anyhow::Result;
use base64::engine::general_purpose::STANDARD as BASE64_ENGINE;
use base64::Engine;
use near_workspaces::types::NearToken;
use serde_json::json;

use super::helpers::*;

// =============================================================================
// Shared setup
// =============================================================================

async fn setup() -> Result<(
    near_workspaces::Worker<near_workspaces::network::Sandbox>,
    near_workspaces::Account,
    near_workspaces::Contract,
)> {
    let worker = create_sandbox().await?;
    let owner = worker.dev_create_account().await?;
    let contract = deploy_scarces(&worker, &owner).await?;
    Ok((worker, owner, contract))
}

async fn user_with_storage(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
    contract: &near_workspaces::Contract,
) -> Result<near_workspaces::Account> {
    let user = worker.dev_create_account().await?;
    storage_deposit(contract, &user, None, DEPOSIT_LARGE)
        .await?
        .into_result()?;
    Ok(user)
}

// =============================================================================
// SignedPayload — Happy Path: relayer mints on behalf of user
// =============================================================================

#[tokio::test]
async fn test_signed_payload_quick_mint() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Must use the full round-tripped action JSON for signing.
    let action = action_quick_mint("Signed Mint");

    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0, // no expiry
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "signed payload quick_mint should succeed: {:?}",
        result.failures()
    );

    // Verify the token is owned by the user (not the relayer).
    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "1", "user should own the minted token");

    let relayer_supply = nft_supply_for_owner(&contract, &relayer.id().to_string()).await?;
    assert_eq!(relayer_supply, "0", "relayer should own nothing");

    Ok(())
}

// =============================================================================
// SignedPayload — Nonce replay rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_replay_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // First call with nonce=1 succeeds.
    let action = action_quick_mint("First");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );
    execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Replay with same nonce=1 must fail.
    let action2 = action_quick_mint("Replay");
    let sig2 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action2,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action2,
        &pk_str,
        1,
        0,
        &sig2,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "replayed nonce should be rejected"
    );

    // Nonce=2 should succeed (monotonic advance).
    let action3 = action_quick_mint("Second");
    let sig3 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        2,
        0,
        &action3,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action3,
        &pk_str,
        2,
        0,
        &sig3,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "nonce=2 after nonce=1 should succeed: {:?}",
        result.failures()
    );

    Ok(())
}

// =============================================================================
// SignedPayload — Expired signature rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_expired_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Expired");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        1, // 1ms after epoch — already expired
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        1,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "expired signature should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("expired"),
        "expected 'expired' error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — Invalid signature rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_bad_signature_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (_sk, pk_str) = make_ed25519_keypair(7);
    let (wrong_sk, _) = make_ed25519_keypair(99); // different key

    let action = action_quick_mint("Bad Sig");
    // Sign with wrong key
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &wrong_sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "invalid signature should be rejected"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — Storage deposit via relayer
// =============================================================================

#[tokio::test]
async fn test_signed_payload_storage_deposit() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = worker.dev_create_account().await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Relayer deposits storage on behalf of user via signed payload.
    let action = action_storage_deposit();
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        DEPOSIT_LARGE,
    )
    .await?;
    assert!(
        result.is_success(),
        "signed storage_deposit should succeed: {:?}",
        result.failures()
    );

    // User should now have a storage balance.
    let balance = storage_balance_of(&contract, &user.id().to_string()).await?;
    let b: u128 = balance.parse().unwrap_or(0);
    assert!(b > 0, "user should have storage balance after deposit");

    Ok(())
}

// =============================================================================
// DelegateAction — Happy path: relayer mints with delegation
// =============================================================================

#[tokio::test]
async fn test_delegate_action_quick_mint() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(13);

    let action = action_quick_mint("Delegate Mint");
    let delegate_action = json!({
        "receiver_id": contract.id().to_string(),
        "actions": ["quick_mint"]
    });

    let sig = sign_scarces_delegate(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &delegate_action,
        &sk,
    );

    let result = execute_with_delegate_action(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        delegate_action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "delegate_action quick_mint should succeed: {:?}",
        result.failures()
    );

    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "1", "user should own the delegated mint token");

    Ok(())
}

// =============================================================================
// DelegateAction — Nonce replay rejected
// =============================================================================

#[tokio::test]
async fn test_delegate_action_nonce_replay_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(13);

    let delegate_action = json!({
        "receiver_id": contract.id().to_string(),
        "actions": ["quick_mint"]
    });

    // First call nonce=1 succeeds.
    let action1 = action_quick_mint("DA First");
    let sig1 = sign_scarces_delegate(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action1,
        &delegate_action,
        &sk,
    );
    execute_with_delegate_action(
        &contract,
        &relayer,
        user.id().as_str(),
        action1,
        delegate_action.clone(),
        &pk_str,
        1,
        0,
        &sig1,
        NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Replay nonce=1 must fail.
    let action2 = action_quick_mint("DA Replay");
    let sig2 = sign_scarces_delegate(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action2,
        &delegate_action,
        &sk,
    );
    let result = execute_with_delegate_action(
        &contract,
        &relayer,
        user.id().as_str(),
        action2,
        delegate_action,
        &pk_str,
        1,
        0,
        &sig2,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "delegate_action nonce replay should be rejected"
    );

    Ok(())
}

// =============================================================================
// Intent — Unauthorized executor rejected
// =============================================================================

#[tokio::test]
async fn test_intent_unauthorized_executor_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let fake_executor = worker.dev_create_account().await?;

    let action = json!({
        "type": "quick_mint",
        "metadata": { "title": "Hacked" },
    });

    let result = execute_with_intent(
        &contract,
        &fake_executor,
        user.id().as_str(),
        action,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "non-allowlisted executor should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.contains("intent_executor") || err.contains("Unauthorized"),
        "expected intent_executor or Unauthorized error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// Intent — Authorized executor mints on behalf of user
// =============================================================================

#[tokio::test]
async fn test_intent_authorized_executor_mints() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let executor = worker.dev_create_account().await?;

    // Owner adds executor to allowlist.
    add_intents_executor(&contract, &owner, &executor)
        .await?
        .into_result()?;

    let action = json!({
        "type": "quick_mint",
        "metadata": { "title": "Intent Mint" },
    });

    let result = execute_with_intent(
        &contract,
        &executor,
        user.id().as_str(),
        action,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "authorized intent executor should succeed: {:?}",
        result.failures()
    );

    // Token belongs to user, not executor.
    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "1", "user should own the intent-minted token");

    let exec_supply = nft_supply_for_owner(&contract, &executor.id().to_string()).await?;
    assert_eq!(exec_supply, "0", "executor should own nothing");

    Ok(())
}

// =============================================================================
// Intent — Executor removed from allowlist is rejected
// =============================================================================

#[tokio::test]
async fn test_intent_removed_executor_rejected() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let executor = worker.dev_create_account().await?;

    // Add then remove executor.
    add_intents_executor(&contract, &owner, &executor)
        .await?
        .into_result()?;

    owner
        .call(contract.id(), "remove_intents_executor")
        .args_json(json!({ "executor": executor.id().to_string() }))
        .deposit(ONE_YOCTO)
        .transact()
        .await?
        .into_result()?;

    let action = json!({
        "type": "quick_mint",
        "metadata": { "title": "After Remove" },
    });

    let result = execute_with_intent(
        &contract,
        &executor,
        user.id().as_str(),
        action,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "removed executor should be rejected"
    );

    Ok(())
}

// =============================================================================
// Intent — Purchase on behalf of user (actor vs payer separation)
// =============================================================================

#[tokio::test]
async fn test_intent_purchase_from_collection() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let executor = worker.dev_create_account().await?;

    add_intents_executor(&contract, &owner, &executor)
        .await?
        .into_result()?;

    // Create a collection at 1 NEAR per token.
    create_collection(
        &contract,
        &creator,
        "intent-col",
        5,
        "1000000000000000000000000",
        json!({"title": "Intent Token #{id}", "description": "Test"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Executor purchases on behalf of buyer — must include max_price_per_token.
    let action = action_purchase_from_collection(
        "intent-col",
        1,
        "1000000000000000000000000",
    );

    let result = execute_with_intent(
        &contract,
        &executor,
        buyer.id().as_str(),
        action,
        NearToken::from_near(2),
    )
    .await?;
    assert!(
        result.is_success(),
        "intent purchase should succeed: {:?}",
        result.failures()
    );

    // Token belongs to buyer.
    let supply = nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(supply, "1", "buyer should own the purchased token");

    Ok(())
}

// =============================================================================
// Gasless purchase — relayer + prepaid balance (draw_user_balance path)
// =============================================================================

#[tokio::test]
async fn test_gasless_purchase_via_prepaid_balance() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let executor = worker.dev_create_account().await?;

    add_intents_executor(&contract, &owner, &executor)
        .await?
        .into_result()?;

    // Top up buyer's storage balance so they have prepaid funds.
    storage_deposit(&contract, &buyer, None, NearToken::from_near(5))
        .await?
        .into_result()?;

    // Create a 1 NEAR collection.
    create_collection(
        &contract,
        &creator,
        "gasless-col",
        5,
        "1000000000000000000000000",
        json!({"title": "Gasless Token #{id}", "description": "Test"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Executor issues a 0-deposit purchase (gasless) — draw_user_balance kicks in.
    let action = action_purchase_from_collection(
        "gasless-col",
        1,
        "1000000000000000000000000",
    );

    let result = execute_with_intent(
        &contract,
        &executor,
        buyer.id().as_str(),
        action,
        NearToken::from_yoctonear(0), // zero deposit — gasless
    )
    .await?;
    assert!(
        result.is_success(),
        "gasless purchase via prepaid balance should succeed: {:?}",
        result.failures()
    );

    let supply = nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(supply, "1", "buyer should own the gasless-purchased token");

    Ok(())
}

// =============================================================================
// Confirmation bypass — signed auth skips 1-yoctoNEAR gate
// =============================================================================

#[tokio::test]
async fn test_signed_auth_bypasses_confirmation_gate() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Mint a token first (via direct auth).
    quick_mint(&contract, &user, "Gate Token", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // TransferScarce requires_confirmation() = true for direct auth.
    // With signed payload, it should succeed without 1 yoctoNEAR.
    let buyer = user_with_storage(&worker, &contract).await?;
    let action = action_transfer_scarce(token_id, &buyer.id().to_string());
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1), // deposit goes to storage, not confirmation
    )
    .await?;
    assert!(
        result.is_success(),
        "signed auth should bypass confirmation gate: {:?}",
        result.failures()
    );

    // Token now belongs to buyer.
    let supply = nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(supply, "1", "buyer should own transferred token");

    Ok(())
}

// =============================================================================
// Direct auth — confirmation-requiring action fails without deposit
// =============================================================================

#[tokio::test]
async fn test_direct_auth_requires_confirmation_deposit() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;

    // Mint a token.
    quick_mint(&contract, &user, "Confirm Token", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // TransferScarce requires 1 yoctoNEAR for direct auth.
    // Sending 0 deposit should fail.
    let buyer = user_with_storage(&worker, &contract).await?;
    let result = execute_action(
        &contract,
        &user,
        json!({
            "type": "transfer_scarce",
            "token_id": token_id,
            "receiver_id": buyer.id().to_string(),
        }),
        NearToken::from_yoctonear(0),
    )
    .await?;
    assert!(
        result.is_failure(),
        "direct auth transfer with 0 deposit should fail"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.contains("confirmation") || err.contains("yoctoNEAR"),
        "expected confirmation deposit error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — missing target_account rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_missing_target_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("No Target");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );

    // Submit without target_account — should fail.
    let result = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "action": action,
                "auth": {
                    "type": "signed_payload",
                    "public_key": pk_str,
                    "nonce": "1",
                    "expires_at_ms": "0",
                    "signature": sig
                }
            }
        }))
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;
    assert!(
        result.is_failure(),
        "missing target_account should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.contains("target_account"),
        "expected target_account error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — wrong contract domain rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_wrong_contract_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Wrong Contract");
    // Sign against a DIFFERENT contract_id.
    let sig = sign_scarces_payload(
        "wrong-contract.testnet",
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "signature for wrong contract should be rejected"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — wrong action rejected (sign one action, submit another)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_wrong_action_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Sign a quick_mint action.
    let signed_action = action_quick_mint("Signed");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &signed_action,
        &sk,
    );

    // But submit a DIFFERENT action (storage_deposit).
    let submitted_action = action_storage_deposit();
    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        submitted_action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "signature for different action should be rejected"
    );

    Ok(())
}

// =============================================================================
// DelegateAction — wrong key rejected
// =============================================================================

#[tokio::test]
async fn test_delegate_wrong_key_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, _pk_str) = make_ed25519_keypair(13);
    let (_, wrong_pk_str) = make_ed25519_keypair(99); // different key

    let action = action_quick_mint("Wrong Key DA");
    let delegate_action = json!({
        "receiver_id": contract.id().to_string(),
        "actions": ["quick_mint"]
    });

    // Sign with sk (seed 13) but claim it's wrong_pk (seed 99).
    let sig = sign_scarces_delegate(
        contract.id().as_str(),
        user.id().as_str(),
        &wrong_pk_str, // sign with wrong pk in payload
        1,
        0,
        &action,
        &delegate_action,
        &sk,
    );

    let result = execute_with_delegate_action(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        delegate_action,
        &wrong_pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "delegate_action with wrong key should be rejected"
    );

    Ok(())
}

// =============================================================================
// Nonce — skip allowed (non-sequential nonces OK)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_skip_allowed() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // nonce=1 succeeds.
    let action1 = action_quick_mint("Skip N1");
    let sig1 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action1,
        &sk,
    );
    execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action1, &pk_str, 1, 0, &sig1, NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // nonce=100 (skip) should succeed.
    let action2 = action_quick_mint("Skip N100");
    let sig2 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        100,
        0,
        &action2,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action2, &pk_str, 100, 0, &sig2, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "nonce skip from 1 to 100 should succeed: {:?}",
        result.failures()
    );

    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "2", "both mints should succeed");

    Ok(())
}

// =============================================================================
// Nonce — zero rejected (boundary: last=0, new=0 → not strictly greater)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_zero_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Nonce Zero");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        0, // nonce=0
        0,
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action, &pk_str, 0, 0, &sig, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "nonce=0 should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("nonce"),
        "expected nonce error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// Nonce — regression rejected (high→low nonce fails)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_regression_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Succeed at nonce=100.
    let action1 = action_quick_mint("High Nonce");
    let sig1 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        100,
        0,
        &action1,
        &sk,
    );
    execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action1, &pk_str, 100, 0, &sig1, NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Attempt nonce=50 (lower) — must fail.
    let action2 = action_quick_mint("Low Nonce");
    let sig2 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        50,
        0,
        &action2,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action2, &pk_str, 50, 0, &sig2, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "nonce regression (100→50) should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("nonce"),
        "expected nonce error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// Nonce — isolation between keys (same account, different keys)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_isolation_between_keys() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk_a, pk_a) = make_ed25519_keypair(7);
    let (sk_b, pk_b) = make_ed25519_keypair(13);

    // Key A uses nonce=50.
    let action_a = action_quick_mint("Key A N50");
    let sig_a = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_a,
        50,
        0,
        &action_a,
        &sk_a,
    );
    execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action_a, &pk_a, 50, 0, &sig_a, NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Key B at nonce=1 should succeed (independent counter).
    let action_b = action_quick_mint("Key B N1");
    let sig_b = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_b,
        1,
        0,
        &action_b,
        &sk_b,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action_b, &pk_b, 1, 0, &sig_b, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "key B nonce=1 should succeed independently of key A nonce=50: {:?}",
        result.failures()
    );

    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "2", "both keys should mint independently");

    Ok(())
}

// =============================================================================
// Nonce — cross-account isolation (same key, different accounts)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_cross_account_isolation() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let alice = user_with_storage(&worker, &contract).await?;
    let bob = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Alice uses nonce=10.
    let action_a = action_quick_mint("Alice N10");
    let sig_a = sign_scarces_payload(
        contract.id().as_str(),
        alice.id().as_str(),
        &pk_str,
        10,
        0,
        &action_a,
        &sk,
    );
    execute_with_signed_payload(
        &contract, &relayer, alice.id().as_str(),
        action_a, &pk_str, 10, 0, &sig_a, NearToken::from_near(1),
    )
    .await?
    .into_result()?;

    // Bob uses nonce=1 with the SAME key — should succeed (independent counter).
    let action_b = action_quick_mint("Bob N1");
    let sig_b = sign_scarces_payload(
        contract.id().as_str(),
        bob.id().as_str(),
        &pk_str,
        1,
        0,
        &action_b,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, bob.id().as_str(),
        action_b, &pk_str, 1, 0, &sig_b, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "Bob nonce=1 should succeed independently of Alice nonce=10: {:?}",
        result.failures()
    );

    let alice_supply = nft_supply_for_owner(&contract, &alice.id().to_string()).await?;
    let bob_supply = nft_supply_for_owner(&contract, &bob.id().to_string()).await?;
    assert_eq!(alice_supply, "1");
    assert_eq!(bob_supply, "1");

    Ok(())
}

// =============================================================================
// Nonce — u64::MAX is terminal (no further nonce possible)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_nonce_u64_max_is_terminal() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);
    let max_nonce = u64::MAX;

    // Submit with nonce = u64::MAX — should succeed.
    let action1 = action_quick_mint("Max Nonce");
    let sig1 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        max_nonce,
        0,
        &action1,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action1, &pk_str, max_nonce, 0, &sig1, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "nonce=u64::MAX should succeed: {:?}",
        result.failures()
    );

    // Attempting nonce=u64::MAX again must fail (not strictly greater).
    let action2 = action_quick_mint("Max Again");
    let sig2 = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        max_nonce,
        0,
        &action2,
        &sk,
    );
    let result = execute_with_signed_payload(
        &contract, &relayer, user.id().as_str(),
        action2, &pk_str, max_nonce, 0, &sig2, NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_failure(),
        "after u64::MAX, no further nonce should be accepted"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("nonce"),
        "expected nonce error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — secp256k1 key rejected (only ed25519 supported)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_secp256k1_key_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    // Create a fake secp256k1 public key string (64 bytes raw key).
    let fake_secp_key_bytes = [0x42u8; 64];
    let secp_pk_str = format!(
        "secp256k1:{}",
        bs58::encode(&fake_secp_key_bytes).into_string()
    );

    let action = action_quick_mint("Secp256k1");
    let dummy_sig = BASE64_ENGINE.encode([0u8; 64]);

    let result = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": user.id().to_string(),
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
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "secp256k1 key should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.contains("ed25519") || err.contains("ED25519") || err.contains("Only"),
        "expected ed25519-only error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — truncated signature rejected (< 64 bytes)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_truncated_signature_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (_sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Truncated Sig");
    let truncated_sig = BASE64_ENGINE.encode([0u8; 63]); // 63 bytes, not 64

    let result = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": user.id().to_string(),
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
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "truncated signature (63 bytes) should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("signature") || err.to_lowercase().contains("invalid"),
        "expected signature error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — oversized signature rejected (> 64 bytes)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_oversized_signature_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (_sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Oversized Sig");
    let oversized_sig = BASE64_ENGINE.encode([0u8; 65]); // 65 bytes, not 64

    let result = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": user.id().to_string(),
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
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "oversized signature (65 bytes) should be rejected"
    );
    let err = format!("{:?}", result.failures());
    assert!(
        err.to_lowercase().contains("signature") || err.to_lowercase().contains("invalid"),
        "expected signature error, got: {err}"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — empty signature rejected
// =============================================================================

#[tokio::test]
async fn test_signed_payload_empty_signature_rejected() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (_sk, pk_str) = make_ed25519_keypair(7);

    let action = action_quick_mint("Empty Sig");
    let empty_sig = BASE64_ENGINE.encode([]); // 0 bytes

    let result = relayer
        .call(contract.id(), "execute")
        .args_json(json!({
            "request": {
                "target_account": user.id().to_string(),
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
        .deposit(NearToken::from_near(1))
        .max_gas()
        .transact()
        .await?;

    assert!(
        result.is_failure(),
        "empty signature should be rejected"
    );

    Ok(())
}

// =============================================================================
// SignedPayload — JSON key order invariance (canonicalization)
// =============================================================================

#[tokio::test]
async fn test_signed_payload_json_key_order_invariance() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Sign with metadata keys in one order (title first).
    let action_for_signing = action_quick_mint("Order Test");
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action_for_signing,
        &sk,
    );

    // Submit with metadata keys in DIFFERENT order.
    // The contract deserializes and re-serializes through the Action enum,
    // then canonicalizes (sorts keys) before verification — so key order
    // in the submitted JSON should not matter.
    // We reverse the top-level keys: put "metadata" before "type".
    let action_different_order = json!({
        "metadata": {
            "title": "Order Test",
            "description": null,
            "media": null,
            "media_hash": null,
            "copies": null,
            "issued_at": null,
            "expires_at": null,
            "starts_at": null,
            "updated_at": null,
            "extra": null,
            "reference": null,
            "reference_hash": null
        },
        "options": null,
        "type": "quick_mint"
    });

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action_different_order,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1),
    )
    .await?;
    assert!(
        result.is_success(),
        "signature should verify despite different JSON key ordering: {:?}",
        result.failures()
    );

    let supply = nft_supply_for_owner(&contract, &user.id().to_string()).await?;
    assert_eq!(supply, "1", "token should be minted");

    Ok(())
}

// =============================================================================
// SignedPayload — transfer with signed auth bypasses confirmation
// =============================================================================

#[tokio::test]
async fn test_signed_payload_transfer_bypasses_confirmation() -> Result<()> {
    let (worker, _owner, contract) = setup().await?;
    let user = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let relayer = worker.dev_create_account().await?;

    let (sk, pk_str) = make_ed25519_keypair(7);

    // Mint a token.
    quick_mint(&contract, &user, "Transfer Token", DEPOSIT_LARGE)
        .await?
        .into_result()?;
    let tokens =
        nft_tokens_for_owner(&contract, &user.id().to_string(), None, Some(10)).await?;
    let token_id = &tokens[0].token_id;

    // Transfer via signed payload with 0 deposit — should bypass confirmation gate.
    let action = action_transfer_scarce(token_id, &buyer.id().to_string());
    let sig = sign_scarces_payload(
        contract.id().as_str(),
        user.id().as_str(),
        &pk_str,
        1,
        0,
        &action,
        &sk,
    );

    let result = execute_with_signed_payload(
        &contract,
        &relayer,
        user.id().as_str(),
        action,
        &pk_str,
        1,
        0,
        &sig,
        NearToken::from_near(1), // deposit covers storage, not confirmation
    )
    .await?;
    assert!(
        result.is_success(),
        "signed transfer should bypass confirmation gate: {:?}",
        result.failures()
    );

    let buyer_supply = nft_supply_for_owner(&contract, &buyer.id().to_string()).await?;
    assert_eq!(buyer_supply, "1", "buyer should own transferred token");

    Ok(())
}

// =============================================================================
// Intent — executor cannot bypass price
// =============================================================================

#[tokio::test]
async fn test_intent_executor_cannot_bypass_price() -> Result<()> {
    let (worker, owner, contract) = setup().await?;
    let creator = user_with_storage(&worker, &contract).await?;
    let buyer = user_with_storage(&worker, &contract).await?;
    let executor = worker.dev_create_account().await?;

    add_intents_executor(&contract, &owner, &executor)
        .await?
        .into_result()?;

    // Create a collection at 1 NEAR per token.
    create_collection(
        &contract,
        &creator,
        "price-col",
        5,
        "1000000000000000000000000",
        json!({"title": "Price Token #{id}", "description": "Test"}),
        DEPOSIT_LARGE,
    )
    .await?
    .into_result()?;

    // Executor tries to purchase with insufficient deposit (0.1 NEAR for 1 NEAR token).
    let action = action_purchase_from_collection(
        "price-col",
        1,
        "100000000000000000000000", // max_price = 0.1 NEAR (too low)
    );

    let result = execute_with_intent(
        &contract,
        &executor,
        buyer.id().as_str(),
        action,
        NearToken::from_millinear(100), // 0.1 NEAR
    )
    .await?;
    assert!(
        result.is_failure(),
        "intent executor should not bypass price requirements"
    );

    Ok(())
}
