//! Auth dispatch: verifies `Auth` variant and returns `AuthContext`.

use near_sdk::serde_json::Value;
use near_sdk::{AccountId, env};
use onsocial_types::AuthError;

use crate::auth_types::{Auth, AuthContext};

/// Verify auth and produce an `AuthContext`.
///
/// `domain_prefix_base` is contract-specific (e.g. `"onsocial:execute"`).
/// Appends `:v1` for `SignedPayload`, `:delegate:v1` for `DelegateAction`.
/// `nonce_prefix` isolates nonce storage per contract.
pub fn authenticate(
    auth: &Auth,
    target_account: Option<&AccountId>,
    action_json: &Value,
    nonce_prefix: u8,
    intents_executors: &[AccountId],
    domain_prefix_base: &str,
) -> Result<AuthContext, AuthError> {
    let attached_balance = env::attached_deposit().as_yoctonear();

    match auth {
        Auth::Direct => {
            let signer = env::signer_account_id();
            let payer = env::predecessor_account_id();

            Ok(AuthContext {
                actor_id: signer,
                payer_id: payer.clone(),
                deposit_owner: payer,
                auth_type: "direct",
                attached_balance,
                signed_nonce: None,
            })
        }

        Auth::SignedPayload {
            public_key,
            nonce,
            expires_at_ms,
            signature,
        } => {
            let target = target_account.ok_or_else(|| {
                AuthError::InvalidInput("target_account required for signed_payload".into())
            })?;

            let domain_prefix = format!("{domain_prefix_base}:v1");
            verify_and_check_nonce(
                target,
                public_key,
                nonce.0,
                nonce_prefix,
                &crate::Verify {
                    domain_prefix: &domain_prefix,
                    target_account: target,
                    public_key,
                    nonce: nonce.0,
                    expires_at_ms: expires_at_ms.0,
                    signature: &signature.0,
                    action: action_json,
                    delegate_action: None,
                },
            )?;

            let payer = env::predecessor_account_id();

            Ok(AuthContext {
                actor_id: target.clone(),
                payer_id: payer.clone(),
                deposit_owner: payer,
                auth_type: "signed_payload",
                attached_balance,
                signed_nonce: Some((target.clone(), public_key.clone(), nonce.0)),
            })
        }

        Auth::DelegateAction {
            public_key,
            nonce,
            expires_at_ms,
            signature,
            action: delegate_action,
        } => {
            let target = target_account.ok_or_else(|| {
                AuthError::InvalidInput("target_account required for delegate_action".into())
            })?;

            let domain_prefix = format!("{domain_prefix_base}:delegate:v1");
            verify_and_check_nonce(
                target,
                public_key,
                nonce.0,
                nonce_prefix,
                &crate::Verify {
                    domain_prefix: &domain_prefix,
                    target_account: target,
                    public_key,
                    nonce: nonce.0,
                    expires_at_ms: expires_at_ms.0,
                    signature: &signature.0,
                    action: action_json,
                    delegate_action: Some(delegate_action),
                },
            )?;

            let payer = env::predecessor_account_id();

            Ok(AuthContext {
                actor_id: target.clone(),
                payer_id: payer.clone(),
                deposit_owner: payer,
                auth_type: "delegate_action",
                attached_balance,
                signed_nonce: Some((target.clone(), public_key.clone(), nonce.0)),
            })
        }

        Auth::Intent {
            actor_id,
            intent: _,
        } => {
            let payer = env::predecessor_account_id();

            if !intents_executors.contains(&payer) {
                return Err(AuthError::Unauthorized(
                    "intent_executor".into(),
                    payer.to_string(),
                ));
            }

            Ok(AuthContext {
                actor_id: actor_id.clone(),
                payer_id: payer.clone(),
                deposit_owner: payer,
                auth_type: "intent",
                attached_balance,
                signed_nonce: None,
            })
        }
    }
}

fn verify_and_check_nonce(
    target: &AccountId,
    public_key: &near_sdk::PublicKey,
    nonce: u64,
    nonce_prefix: u8,
    params: &crate::Verify<'_>,
) -> Result<(), AuthError> {
    crate::verify_signature(params)?;
    crate::nonce::assert_nonce_fresh(nonce_prefix, target, public_key, nonce)?;
    Ok(())
}
