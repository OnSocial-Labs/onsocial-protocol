use near_sdk::serde_json::Value;
use near_sdk::{AccountId, PublicKey};

use crate::SocialError;
use crate::events::EventBatch;
use crate::protocol::Options;
use crate::state::models::SocialPlatform;
use crate::state::set_context::{ApiOperationContext, VerifiedContext};

pub(crate) struct SetOperation<'a> {
    pub target_account: &'a AccountId,
    pub data: Value,
    pub options: Options,
    pub signed_nonce: Option<(AccountId, PublicKey, u64)>,
}

impl SocialPlatform {
    fn require_batch_size_within_limit(&self, batch_len: usize) -> Result<(), SocialError> {
        let limit = self.config.max_batch_size as usize;
        if batch_len > limit {
            return Err(crate::invalid_input!("Batch size exceeded"));
        }
        Ok(())
    }

    /// Executes set operations, consuming storage costs from the provided balance.
    pub(crate) fn execute_set_operations_with_balance(
        &mut self,
        verified: &VerifiedContext,
        event_batch: &mut EventBatch,
        op: SetOperation,
        attached_balance: &mut u128,
    ) -> Result<(), SocialError> {
        let mut processed_accounts = std::collections::HashSet::new();

        if let Some((owner, public_key, nonce_u64)) = op.signed_nonce {
            let new_bytes = Self::record_nonce(&owner, &public_key, nonce_u64);
            if new_bytes > 0 {
                let cost = new_bytes as u128 * near_sdk::env::storage_byte_cost().as_yoctonear();
                *attached_balance = attached_balance.saturating_sub(cost);
            }
        }

        let data_obj = crate::protocol::operation::require_non_empty_object(&op.data)?;
        self.require_batch_size_within_limit(data_obj.len())?;

        for (key, value) in data_obj {
            let mut ctx = ApiOperationContext {
                event_batch,
                attached_balance,
                processed_accounts: &mut processed_accounts,
            };
            self.process_api_operation(key, value, op.target_account, verified, &mut ctx)?;
        }

        self.finalize_unused_attached_deposit(
            attached_balance,
            &verified.deposit_owner,
            op.options.refund_unused_deposit,
            "unused_deposit_saved",
            event_batch,
            Some(crate::state::platform::UnusedDepositEventMeta {
                auth_type: verified.auth_type,
                actor_id: &verified.actor_id,
                payer_id: &verified.payer_id,
                target_account: op.target_account,
            }),
        )?;

        event_batch.emit()?;
        Ok(())
    }

    pub(crate) fn process_api_operation(
        &mut self,
        key: &str,
        value: &Value,
        account_id: &AccountId,
        verified: &VerifiedContext,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        use crate::protocol::operation::{ApiOperationKey, classify_api_operation_key};

        match classify_api_operation_key(key)? {
            ApiOperationKey::StorageDeposit => {
                self.handle_api_storage_deposit(value, account_id, ctx)
            }
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
