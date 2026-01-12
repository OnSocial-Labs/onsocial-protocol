use near_sdk::AccountId;
use near_sdk::serde_json::Value;

use crate::state::set_context::{ApiOperationContext, DataOperationContext, OperationContext};
use crate::state::models::SocialPlatform;
use crate::validation::validate_json_value_simple;
use crate::validation::Path;
use crate::SocialError;

impl SocialPlatform {
    pub(crate) fn process_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        predecessor: &AccountId,
        ctx: &mut OperationContext,
    ) -> Result<(), SocialError> {
        let path_obj = Path::new(account_id, path, self)?;
        let full_path = path_obj.full_path();

        validate_json_value_simple(value)?;

        let data_ctx = DataOperationContext {
            value,
            account_id,
            predecessor,
            full_path,
        };
        self.handle_data_operation(&data_ctx, ctx)
    }

    pub(crate) fn handle_data_operation(
        &mut self,
        data_ctx: &DataOperationContext,
        ctx: &mut OperationContext,
    ) -> Result<(), SocialError> {
        if crate::storage::utils::extract_group_id_from_path(data_ctx.full_path).is_some() {
            match crate::domain::groups::GroupContentManager::create_group_content(
                self,
                data_ctx.full_path,
                data_ctx.value,
                data_ctx.predecessor,
                ctx.attached_balance.as_deref_mut(),
                ctx.event_batch,
            ) {
                Ok(user_path) => {
                    ctx.success_paths.push(user_path);
                    return Ok(());
                }
                Err(e) => {
                    ctx.errors.push(e);
                    return Ok(());
                }
            }
        }

        let serialized_value = crate::validation::serialize_json_with_max_len(
            data_ctx.value,
            self.config.max_value_bytes as usize,
            "Serialization failed",
            "Value payload too large",
        )?;
        let data_entry = crate::state::models::DataEntry {
            value: crate::state::models::DataValue::Value(serialized_value),
            block_height: near_sdk::env::block_height(),
        };

        if data_ctx.value.is_null() {
            let deleted = if let Some(entry) = self.get_entry(data_ctx.full_path) {
                crate::storage::soft_delete_entry(self, data_ctx.full_path, entry)?
            } else {
                false
            };
            
            if deleted {
                let mut extra = crate::events::derived_fields_from_path(data_ctx.full_path);
                crate::events::insert_block_context(&mut extra);
                let mut builder = crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_DATA_UPDATE,
                    "remove",
                    data_ctx.account_id.clone(),
                )
                .with_path(data_ctx.full_path)
                .with_value(data_ctx.value.clone());
                for (k, v) in extra {
                    builder = builder.with_field(k, v);
                }
                builder.emit(ctx.event_batch);
            }
        } else {
            let mut extra = crate::events::derived_fields_from_path(data_ctx.full_path);
            crate::events::insert_block_context(&mut extra);
            let mut builder = crate::events::EventBuilder::new(
                crate::constants::EVENT_TYPE_DATA_UPDATE,
                "set",
                data_ctx.account_id.clone(),
            )
            .with_path(data_ctx.full_path)
            .with_value(data_ctx.value.clone());
            for (k, v) in extra {
                builder = builder.with_field(k, v);
            }
            builder.emit(ctx.event_batch);

            let sponsor_outcome = self
                .insert_entry_with_fallback(
                    data_ctx.full_path,
                    data_entry,
                    ctx.attached_balance.as_deref_mut(),
                )?
                .1;

            if let Some(crate::state::operations::SponsorOutcome::GroupSpend {
                group_id,
                payer,
                bytes,
                remaining_allowance,
            }) = sponsor_outcome
            {
                let mut builder = crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                    "group_sponsor_spend",
                    payer.clone(),
                )
                .with_field("group_id", group_id)
                .with_field("payer", payer.to_string())
                .with_field("bytes", bytes.to_string());

                if let Some(remaining_allowance) = remaining_allowance {
                    builder = builder.with_field("remaining_allowance", remaining_allowance.to_string());
                }

                builder.emit(ctx.event_batch);
            }
        }

        ctx.success_paths.push(data_ctx.full_path.to_string());
        Ok(())
    }

    pub(crate) fn handle_api_data_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        predecessor: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        // Ensure storage coverage is initialized once per account.
        if !ctx.processed_accounts.contains(account_id) {
            let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();

            let already_sponsored = storage.platform_sponsored;
            let has_shared = storage.shared_storage.is_some();
            let has_personal_balance = storage.balance > 0;

            let platform_account = Self::platform_pool_account();
            let pool_has_funds = self
                .shared_storage_pools
                .get(&platform_account)
                .map(|pool| pool.storage_balance > 0 && pool.available_bytes() > 0)
                .unwrap_or(false);

            if pool_has_funds && !already_sponsored {
                storage.platform_sponsored = true;
                storage.storage_tracker.reset();
                self.user_storage.insert(account_id.clone(), storage);

                crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                    "platform_sponsor",
                    account_id.clone(),
                )
                .with_field("pool_account", platform_account.to_string())
                .emit(ctx.event_batch);
            } else if !(already_sponsored || has_shared || has_personal_balance) && *ctx.attached_balance > 0 {
                let deposit_amount = *ctx.attached_balance;
                let previous_balance = storage.balance;
                storage.balance = storage.balance.saturating_add(deposit_amount);
                let new_balance = storage.balance;
                storage.storage_tracker.reset();
                self.user_storage.insert(account_id.clone(), storage);
                *ctx.attached_balance = 0;

                crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                    "attached_deposit",
                    account_id.clone(),
                )
                .with_field("amount", deposit_amount.to_string())
                .with_field("previous_balance", previous_balance.to_string())
                .with_field("new_balance", new_balance.to_string())
                .emit(ctx.event_batch);
            }

            ctx.processed_accounts.insert(account_id.clone());
        }

        let mut success_paths = vec![];
        let mut errors = vec![];
        let mut op_ctx = OperationContext {
            event_batch: ctx.event_batch,
            success_paths: &mut success_paths,
            errors: &mut errors,
            attached_balance: Some(ctx.attached_balance),
        };
        self.process_operation(path, value, account_id, predecessor, &mut op_ctx)?;

        if let Some(err) = errors.into_iter().next() {
            return Err(err);
        }

        Ok(())
    }
}
