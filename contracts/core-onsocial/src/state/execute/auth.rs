use near_sdk::serde_json::{Value, json};
use near_sdk::{AccountId, env};

use crate::SocialError;
use crate::events::EventBatch;
use crate::protocol::{Action, Auth, Options, Request};
use crate::state::models::SocialPlatform;

/// Context for verifying ed25519 signatures.
pub(super) struct SignatureContext<'a> {
    pub domain_prefix: &'a str,
    pub public_key: &'a near_sdk::PublicKey,
    pub nonce: near_sdk::json_types::U64,
    pub expires_at_ms: near_sdk::json_types::U64,
    pub signature: &'a near_sdk::json_types::Base64VecU8,
}

/// Verified execution context after auth verification.
pub struct ExecuteContext {
    pub actor_id: AccountId,
    pub payer_id: AccountId,
    pub deposit_owner: AccountId,
    pub auth_type: &'static str,
    pub attached_balance: u128,
    /// (owner, public_key, nonce) for replay protection commit.
    pub signed_nonce: Option<(AccountId, near_sdk::PublicKey, u64)>,
    pub options: Options,
}

impl SocialPlatform {
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        let Request {
            target_account,
            action,
            auth,
            options,
        } = request;

        let auth = auth.unwrap_or_default();
        let options = options.unwrap_or_default();

        let mut ctx =
            self.verify_execute_auth(&auth, target_account.as_ref(), &action, options.clone())?;

        let target_account = target_account.unwrap_or_else(|| ctx.actor_id.clone());

        let result = self.dispatch_action(&action, &target_account, &mut ctx)?;

        self.finalize_execute_nonce(&mut ctx)?;

        self.finalize_execute_deposit(&mut ctx, &options)?;

        Ok(result)
    }

    fn verify_execute_auth(
        &mut self,
        auth: &Auth,
        target_account: Option<&AccountId>,
        action: &Action,
        options: Options,
    ) -> Result<ExecuteContext, SocialError> {
        let attached_balance = env::attached_deposit().as_yoctonear();

        match auth {
            Auth::Direct => {
                let signer = Self::transaction_signer();
                let payer = Self::current_caller();

                Ok(ExecuteContext {
                    actor_id: signer,
                    payer_id: payer.clone(),
                    deposit_owner: payer,
                    auth_type: "direct",
                    attached_balance,
                    signed_nonce: None,
                    options,
                })
            }

            Auth::SignedPayload {
                public_key,
                nonce,
                expires_at_ms,
                signature,
            } => {
                let target = target_account.ok_or_else(|| {
                    crate::invalid_input!("target_account required for signed_payload")
                })?;

                let sig_ctx = SignatureContext {
                    domain_prefix: "onsocial:execute:v1",
                    public_key,
                    nonce: *nonce,
                    expires_at_ms: *expires_at_ms,
                    signature,
                };
                self.verify_execute_signature(target, &sig_ctx, action)?;

                let payer = Self::current_caller();

                Ok(ExecuteContext {
                    actor_id: target.clone(),
                    payer_id: payer.clone(),
                    deposit_owner: payer,
                    auth_type: "signed_payload",
                    attached_balance,
                    signed_nonce: Some((target.clone(), public_key.clone(), nonce.0)),
                    options,
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
                    crate::invalid_input!("target_account required for delegate_action")
                })?;

                let sig_ctx = SignatureContext {
                    domain_prefix: "onsocial:execute:delegate:v1",
                    public_key,
                    nonce: *nonce,
                    expires_at_ms: *expires_at_ms,
                    signature,
                };
                self.verify_execute_signature_with_action(
                    target,
                    &sig_ctx,
                    action,
                    Some(delegate_action),
                )?;

                let payer = Self::current_caller();

                Ok(ExecuteContext {
                    actor_id: target.clone(),
                    payer_id: payer.clone(),
                    deposit_owner: payer,
                    auth_type: "delegate_action",
                    attached_balance,
                    signed_nonce: Some((target.clone(), public_key.clone(), nonce.0)),
                    options,
                })
            }

            Auth::Intent {
                actor_id,
                intent: _,
            } => {
                let payer = Self::current_caller();

                if !self.config.intents_executors.contains(&payer) {
                    return Err(crate::unauthorized!("intent_executor", payer.to_string()));
                }

                Ok(ExecuteContext {
                    actor_id: actor_id.clone(),
                    payer_id: payer.clone(),
                    deposit_owner: payer,
                    auth_type: "intent",
                    attached_balance,
                    signed_nonce: None,
                    options,
                })
            }
        }
    }

    fn verify_execute_signature(
        &mut self,
        target_account: &AccountId,
        sig_ctx: &SignatureContext,
        action: &Action,
    ) -> Result<(), SocialError> {
        self.verify_execute_signature_with_action(target_account, sig_ctx, action, None)
    }

    fn verify_execute_signature_with_action(
        &mut self,
        target_account: &AccountId,
        sig_ctx: &SignatureContext,
        action: &Action,
        delegate_action: Option<&Value>,
    ) -> Result<(), SocialError> {
        let now_ms = env::block_timestamp_ms();
        if sig_ctx.expires_at_ms.0 != 0 && now_ms > sig_ctx.expires_at_ms.0 {
            return Err(crate::invalid_input!("Signed payload expired"));
        }

        let pk_bytes = crate::validation::ed25519_public_key_bytes(sig_ctx.public_key)?;
        let sig_bytes = crate::validation::ed25519_signature_bytes(sig_ctx.signature.0.as_slice())?;

        // Domain separation prevents cross-contract replay.
        let domain = format!("{}:{}", sig_ctx.domain_prefix, env::current_account_id());
        let action_json = near_sdk::serde_json::to_value(action)
            .map_err(|_| crate::invalid_input!("Failed to serialize action"))?;
        let action_canonical =
            crate::protocol::canonical_json::canonicalize_json_value(&action_json);
        let pk_str = String::from(sig_ctx.public_key);

        let payload = json!({
            "target_account": target_account,
            "public_key": pk_str,
            "nonce": sig_ctx.nonce,
            "expires_at_ms": sig_ctx.expires_at_ms,
            "action": action_canonical,
            "delegate_action": delegate_action.map(crate::protocol::canonical_json::canonicalize_json_value),
        });

        let payload_bytes = near_sdk::serde_json::to_vec(&payload)
            .map_err(|_| crate::invalid_input!("Failed to serialize payload"))?;

        let mut message = domain.into_bytes();
        message.reserve_exact(1 + payload_bytes.len());
        message.push(0);
        message.extend_from_slice(&payload_bytes);
        let message_hash = env::sha256_array(&message);

        if !env::ed25519_verify(&sig_bytes, message_hash, &pk_bytes) {
            return Err(crate::permission_denied!("invalid signature", "execute"));
        }

        self.execute_assert_nonce_fresh(target_account, sig_ctx.public_key, sig_ctx.nonce.0)?;

        Ok(())
    }

    fn execute_assert_nonce_fresh(
        &self,
        owner: &AccountId,
        public_key: &near_sdk::PublicKey,
        nonce: u64,
    ) -> Result<(), SocialError> {
        let k = format!(
            "{}/signed_payload_nonces/{}",
            owner.as_str(),
            String::from(public_key)
        );
        let last = self
            .storage_get_string(&k)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        if nonce <= last {
            return Err(crate::invalid_input!("Nonce too low"));
        }
        Ok(())
    }

    fn finalize_execute_nonce(&mut self, ctx: &mut ExecuteContext) -> Result<(), SocialError> {
        if let Some((ref owner, ref public_key, nonce)) = ctx.signed_nonce {
            let mut event_batch = EventBatch::new();
            self.signed_payload_record_nonce(
                owner,
                public_key,
                nonce,
                &mut ctx.attached_balance,
                &mut event_batch,
            )?;
            event_batch.emit()?;
        }
        Ok(())
    }

    fn finalize_execute_deposit(
        &mut self,
        ctx: &mut ExecuteContext,
        options: &Options,
    ) -> Result<(), SocialError> {
        if ctx.attached_balance > 0 {
            let mut event_batch = crate::events::EventBatch::new();
            self.finalize_unused_attached_deposit(
                &mut ctx.attached_balance,
                &ctx.deposit_owner,
                options.refund_unused_deposit,
                "unused_deposit_saved",
                &mut event_batch,
                Some(crate::state::platform::UnusedDepositEventMeta {
                    auth_type: ctx.auth_type,
                    actor_id: &ctx.actor_id,
                    payer_id: &ctx.payer_id,
                    target_account: &ctx.actor_id,
                }),
            )?;
            event_batch.emit()?;
        }
        Ok(())
    }
}
