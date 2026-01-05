use near_sdk::{env, AccountId, PublicKey};
use near_sdk::json_types::{Base64VecU8, U64};
use near_sdk::serde_json::Value;

use crate::events::EventBatch;
use crate::protocol::set::types::SetOptions;
use crate::state::set_context::{ApiOperationContext, VerifiedContext};
use crate::state::models::SocialPlatform;
use crate::SocialError;

impl SocialPlatform {
    fn require_batch_size_within_limit(&self, batch_len: usize) -> Result<(), SocialError> {
        let limit = self.config.max_batch_size as usize;
        if batch_len > limit {
            return Err(crate::invalid_input!("Batch size exceeded"));
        }
        Ok(())
    }

    pub(super) fn execute_set_domain_signed(
        &mut self,
        auth_type: &'static str,
        domain_prefix: &str,
        target_account: &AccountId,
        public_key: PublicKey,
        nonce: U64,
        expires_at_ms: U64,
        signature: Base64VecU8,
        action: Option<Value>,
        actor_override: Option<AccountId>,
        data: Value,
        options: Option<SetOptions>,
    ) -> Result<(), SocialError> {
        // Expiry check (ms).
        let now_ms = env::block_timestamp_ms();
        let expires_at_ms_u64 = expires_at_ms.0;
        if expires_at_ms_u64 != 0 && now_ms > expires_at_ms_u64 {
            return Err(crate::invalid_input!("Signed payload expired"));
        }

        // ed25519 only.
        let pk_bytes = crate::validation::ed25519_public_key_bytes(&public_key)?;
        let sig_bytes = crate::validation::ed25519_signature_bytes(signature.0.as_slice())?;

        // Domain separation to prevent replay.
        let domain = format!("{}:{}", domain_prefix, env::current_account_id());

        // Canonicalize JSON for stable signing.
        let data = crate::protocol::set::canonical_json::canonicalize_json_value(&data);
        let action = action
            .as_ref()
            .map(crate::protocol::set::canonical_json::canonicalize_json_value);

        // Sign exactly what will be executed.
        let payload = crate::protocol::set::signed_payload::SignedSetPayload {
            target_account: target_account.clone(),
            public_key: public_key.clone(),
            nonce,
            expires_at_ms,
            action: action.clone(),
            data: data.clone(),
            options: options.clone(),
        };

        let payload_bytes = near_sdk::serde_json::to_vec(&payload)
            .map_err(|_| crate::invalid_input!("Failed to serialize signed payload"))?;

        let mut message = domain.into_bytes();
        message.reserve_exact(1 + payload_bytes.len());
        message.push(0);
        message.extend_from_slice(&payload_bytes);
        let message_hash = env::sha256_array(&message);

        if !env::ed25519_verify(&sig_bytes, &message_hash, &pk_bytes) {
            return Err(crate::permission_denied!("invalid signature", "set"));
        }

        let nonce_u64 = nonce.0;
        let key_id = String::from(&public_key);

        // Verified context: actor is logical user; payer/deposit_owner is predecessor.
        let payer = env::predecessor_account_id();
        let options = options.unwrap_or_default();
        let actor_id = actor_override.unwrap_or_else(|| target_account.clone());
        let verified = VerifiedContext {
            actor_id,
            payer_id: payer.clone(),
            deposit_owner: payer.clone(),
            actor_pk: Some(public_key.clone()),
            auth_type,
        };

        // Storage/permission ops require MANAGE at root.
        let data_obj = crate::protocol::set::operation::require_non_empty_object(&data)?;
        self.require_batch_size_within_limit(data_obj.len())?;

        // Require an explicit key grant for non-group *data paths*.
        // Reserved operation keys are authorized separately and must not be treated as writable paths.
        for key in data_obj.keys() {
            use crate::protocol::set::operation::classify_api_operation_key;

            let kind = classify_api_operation_key(key.as_str())?;
            if !matches!(kind, crate::protocol::set::operation::ApiOperationKey::DataPath(_)) {
                continue;
            }

            // Canonicalize exactly like storage writes do.
            let path_obj = crate::validation::Path::new(target_account, key, self)?;
            let full_path = path_obj.full_path();
            let is_group_path = crate::storage::utils::extract_group_id_from_path(full_path).is_some();
            if is_group_path {
                continue;
            }

            let ok = crate::domain::groups::permissions::kv::has_permissions_for_key(
                self,
                target_account.as_str(),
                &public_key,
                full_path,
                crate::domain::groups::permissions::kv::types::WRITE,
            );
            if !ok {
                return Err(crate::permission_denied!(
                    "write",
                    &format!("key not authorized for path: {}", full_path)
                ));
            }
        }

        let mut requires_manage_root = false;
        for key in data_obj.keys() {
            use crate::protocol::set::operation::classify_api_operation_key;
            let kind = classify_api_operation_key(key.as_str())?;
            if kind.requires_target_owner() {
                requires_manage_root = true;
                break;
            }
        }

        if requires_manage_root {
            let ok = crate::domain::groups::permissions::kv::has_permissions_for_key(
                self,
                target_account.as_str(),
                &public_key,
                "",
                crate::domain::groups::permissions::kv::types::MANAGE,
            );
            if !ok {
                return Err(crate::permission_denied!("manage", "key_root"));
            }
        }

        // Full permission validation.
        crate::domain::authz::cross_account::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            &verified.actor_id,
            verified.actor_pk.as_ref(),
            true,
        )?;

        // Replay protection: validate nonce after permissions pass.
        self.signed_payload_assert_nonce_fresh(target_account, &public_key, nonce_u64)?;

        // Meta-tx marker event.
        let mut event_batch = EventBatch::new();
        crate::events::EventBuilder::new(crate::constants::EVENT_TYPE_CONTRACT_UPDATE, "set", payer.clone())
            .with_path(&format!("{}/meta_tx", target_account.as_str()))
            .with_target(target_account)
            .with_field("auth_type", verified.auth_type)
            .with_field("actor_id", verified.actor_id.to_string())
            .with_field("payer_id", verified.payer_id.to_string())
            .with_field("public_key", key_id)
            .with_field("nonce", nonce_u64.to_string())
            .with_field("expires_at_ms", expires_at_ms_u64.to_string())
            .emit(&mut event_batch);

        self.execute_set_operations_with_batch(
            &verified,
            &mut event_batch,
            target_account,
            data,
            options,
            Some((target_account.clone(), public_key, nonce_u64)),
        )
    }

    pub(super) fn execute_set_operations_with_batch(
        &mut self,
        verified: &VerifiedContext,
        event_batch: &mut EventBatch,
        target_account: &AccountId,
        data: Value,
        options: SetOptions,
        signed_nonce: Option<(AccountId, PublicKey, u64)>,
    ) -> Result<(), SocialError> {
        let mut attached_balance = env::attached_deposit().as_yoctonear();
        let mut processed_accounts = std::collections::HashSet::new();

        // Record the nonce after signature + permissions validation.
        if let Some((owner, public_key, nonce_u64)) = signed_nonce {
            self.signed_payload_record_nonce(
                &owner,
                &public_key,
                nonce_u64,
                &mut attached_balance,
                event_batch,
            )?;
        }

        let data_obj = crate::protocol::set::operation::require_non_empty_object(&data)?;
        self.require_batch_size_within_limit(data_obj.len())?;

        for (key, value) in data_obj {
            let mut ctx = ApiOperationContext {
                event_batch,
                attached_balance: &mut attached_balance,
                processed_accounts: &mut processed_accounts,
            };
            self.process_api_operation(key, value, target_account, verified, &mut ctx)?;
        }

        self.finalize_unused_attached_deposit(
            &mut attached_balance,
            &verified.deposit_owner,
            options.refund_unused_deposit,
            "unused_deposit_saved",
            event_batch,
            Some(crate::state::platform::UnusedDepositEventMeta {
                auth_type: verified.auth_type,
                actor_id: &verified.actor_id,
                payer_id: &verified.payer_id,
                target_account,
            }),
        )?;

        event_batch.emit()?;
        Ok(())
    }

    /// Process a single operation.
    pub(crate) fn process_api_operation(
        &mut self,
        key: &str,
        value: &Value,
        account_id: &AccountId,
        verified: &VerifiedContext,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        use crate::protocol::set::operation::{classify_api_operation_key, ApiOperationKey};

        match classify_api_operation_key(key)? {
            ApiOperationKey::StorageDeposit => self.handle_api_storage_deposit(value, account_id, ctx),
            ApiOperationKey::StorageWithdraw => {
                self.handle_api_storage_withdraw(value, account_id, &verified.actor_id, ctx)
            }
            ApiOperationKey::StorageSharedPoolDeposit => {
                self.handle_api_shared_pool_deposit(value, account_id, ctx)
            }
            ApiOperationKey::StoragePlatformPoolDeposit => {
                self.handle_api_platform_pool_deposit(value, account_id, ctx)
            }
            ApiOperationKey::StorageGroupPoolDeposit => {
                self.handle_api_group_pool_deposit(value, account_id, ctx)
            }
            ApiOperationKey::StorageGroupSponsorQuotaSet => {
                self.handle_api_group_sponsor_quota_set(value, account_id, ctx)
            }
            ApiOperationKey::StorageGroupSponsorDefaultSet => {
                self.handle_api_group_sponsor_default_set(value, account_id, ctx)
            }
            ApiOperationKey::StorageShareStorage => {
                self.handle_api_share_storage(value, account_id, &verified.actor_id, ctx)
            }
            ApiOperationKey::StorageReturnSharedStorage => {
                self.handle_api_return_shared_storage(account_id, &verified.actor_id, ctx)
            }

            ApiOperationKey::PermissionGrant => self.handle_api_permission_grant(
                value,
                &verified.actor_id,
                ctx.event_batch,
                ctx.attached_balance,
            ),
            ApiOperationKey::PermissionRevoke => {
                self.handle_api_permission_revoke(value, &verified.actor_id, ctx.event_batch)
            }

            ApiOperationKey::DataPath(path) => {
                self.handle_api_data_operation(path, value, account_id, &verified.actor_id, ctx)
            }
        }
    }
}
