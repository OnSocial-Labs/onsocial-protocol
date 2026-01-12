use near_sdk::{env, AccountId};
use near_sdk::serde_json::{json, Value};

use crate::events::EventBatch;
use crate::protocol::{Action, Auth, Options, Request};
use crate::state::models::SocialPlatform;
use crate::SocialError;

/// Verified actor context after auth verification.
pub struct ExecuteContext {
    /// The logical actor performing the action.
    pub actor_id: AccountId,
    /// Who pays for gas/deposits.
    pub payer_id: AccountId,
    /// Who receives unused deposit refunds.
    pub deposit_owner: AccountId,
    /// Auth type for events.
    pub auth_type: &'static str,
    /// Remaining attached balance (mutable for consumption).
    pub attached_balance: u128,
    /// Nonce info for recording after successful execution (owner, public_key, nonce).
    pub signed_nonce: Option<(AccountId, near_sdk::PublicKey, u64)>,
    /// Request options.
    pub options: Options,
}

impl SocialPlatform {
    /// Unified execute entry point with auth verification.
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        let Request {
            target_account,
            action,
            auth,
            options,
        } = request;

        let auth = auth.unwrap_or_default();
        let options = options.unwrap_or_default();

        let mut ctx = self.verify_execute_auth(&auth, target_account.as_ref(), &action, options.clone())?;

        // Resolve target account (defaults to actor for most actions).
        let target_account = target_account.unwrap_or_else(|| ctx.actor_id.clone());

        let result = self.dispatch_action(&action, &target_account, &mut ctx)?;

        // Commit nonce for replay protection.
        self.finalize_execute_nonce(&mut ctx)?;

        self.finalize_execute_deposit(&mut ctx, &options)?;

        Ok(result)
    }

    /// Verify auth and return execution context.
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

                self.verify_execute_signature(
                    "onsocial:execute:v1",
                    target,
                    public_key,
                    *nonce,
                    *expires_at_ms,
                    signature,
                    action,
                )?;

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

                self.verify_execute_signature_with_action(
                    "onsocial:execute:delegate:v1",
                    target,
                    public_key,
                    *nonce,
                    *expires_at_ms,
                    signature,
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

            Auth::Intent { actor_id, intent: _ } => {
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

    /// Verify ed25519 signature for execute.
    fn verify_execute_signature(
        &mut self,
        domain_prefix: &str,
        target_account: &AccountId,
        public_key: &near_sdk::PublicKey,
        nonce: near_sdk::json_types::U64,
        expires_at_ms: near_sdk::json_types::U64,
        signature: &near_sdk::json_types::Base64VecU8,
        action: &Action,
    ) -> Result<(), SocialError> {
        self.verify_execute_signature_with_action(
            domain_prefix,
            target_account,
            public_key,
            nonce,
            expires_at_ms,
            signature,
            action,
            None,
        )
    }

    /// Verify ed25519 signature with optional delegate action field.
    fn verify_execute_signature_with_action(
        &mut self,
        domain_prefix: &str,
        target_account: &AccountId,
        public_key: &near_sdk::PublicKey,
        nonce: near_sdk::json_types::U64,
        expires_at_ms: near_sdk::json_types::U64,
        signature: &near_sdk::json_types::Base64VecU8,
        action: &Action,
        delegate_action: Option<&Value>,
    ) -> Result<(), SocialError> {
        let now_ms = env::block_timestamp_ms();
        if expires_at_ms.0 != 0 && now_ms > expires_at_ms.0 {
            return Err(crate::invalid_input!("Signed payload expired"));
        }

        let pk_bytes = crate::validation::ed25519_public_key_bytes(public_key)?;
        let sig_bytes = crate::validation::ed25519_signature_bytes(signature.0.as_slice())?;

        // Domain separation: prevents cross-contract replay.
        let domain = format!("{}:{}", domain_prefix, env::current_account_id());
        let action_json = near_sdk::serde_json::to_value(action)
            .map_err(|_| crate::invalid_input!("Failed to serialize action"))?;
        let action_canonical = crate::protocol::canonical_json::canonicalize_json_value(&action_json);
        let pk_str = String::from(public_key);

        let payload = json!({
            "target_account": target_account,
            "public_key": pk_str,
            "nonce": nonce,
            "expires_at_ms": expires_at_ms,
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

        if !env::ed25519_verify(&sig_bytes, &message_hash, &pk_bytes) {
            return Err(crate::permission_denied!("invalid signature", "execute"));
        }

        self.execute_assert_nonce_fresh(target_account, public_key, nonce.0)?;

        Ok(())
    }

    /// Assert nonce is fresh for replay protection.
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
        let last = self.storage_get_string(&k)
            .and_then(|s| s.parse::<u64>().ok())
            .unwrap_or(0);
        if nonce <= last {
            return Err(crate::invalid_input!("Nonce too low"));
        }
        Ok(())
    }

    /// Record nonce after successful execution.
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

    /// Finalize deposit handling with proper event emission.
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
