// --- Data Operations ---
use near_sdk::AccountId;
use serde_json::{Value, json};

// --- Data Operations ---
use crate::state::models::SocialPlatform;
use crate::utils::Path;
use crate::validation::validate_json_value_simple;
use crate::SocialError;

// --- Context Structs (shared with other modules) ---
use super::api::{OperationContext, DataOperationContext, ApiOperationContext};

impl SocialPlatform {
    /// Process a single operation for an account (shared between set and set_for)
    pub(crate) fn process_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        predecessor: &AccountId,
        ctx: &mut OperationContext,
    ) -> Result<(), SocialError> {
        // Path validation
        let path_obj = Path::new(account_id, path, self)?;
        let full_path = path_obj.full_path();

        // Basic JSON validation (blockchain provides immutability)
        validate_json_value_simple(value, self)?;

        // Handle account operations
        if self.handle_account_operation(path, value, account_id, ctx.event_batch, ctx.success_paths)? {
            return Ok(());
        }

        // Handle storage operations
        if self.handle_storage_operation(path, value, account_id, ctx)? {
            return Ok(());
        }

        // Handle data operations
        let data_ctx = DataOperationContext {
            value,
            account_id,
            predecessor,
            full_path,
            path_obj: &path_obj,
        };
        self.handle_data_operation(&data_ctx, ctx)
    }

    /// Handle data operations (all other data types)
    pub(crate) fn handle_data_operation(
        &mut self,
        data_ctx: &DataOperationContext,
        ctx: &mut OperationContext,
    ) -> Result<(), SocialError> {
        #[cfg(test)]
        near_sdk::env::log_str(&format!("DATA OPERATION: full_path={}", data_ctx.full_path));
        
        // Check if this is group content - use dedicated GroupContentManager
        // Group content paths should be like "groups/X/..." without user prefix
        if data_ctx.full_path.starts_with("groups/") || data_ctx.full_path.contains("/groups/") {
            #[cfg(test)]
            near_sdk::env::log_str("Calling GroupContentManager");
            
            match crate::groups::GroupContentManager::create_group_content(
                self, data_ctx.full_path, data_ctx.value, data_ctx.predecessor, ctx.event_batch
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

        // Process regular data operation
        let tags = vec![data_ctx.path_obj.parts().get(1).map_or("data".into(), |p| p.to_string())];
        let serialized_value = serde_json::to_vec(data_ctx.value)
            .map_err(|_| crate::invalid_input!("Serialization failed"))?;
        let metadata = crate::data::metadata::MetadataBuilder::from_path(data_ctx.full_path, data_ctx.predecessor, Some(data_ctx.value))
            .build();
        let serialized_metadata = serde_json::to_vec(&metadata)
            .map_err(|_| crate::invalid_input!("Metadata serialization failed"))?;
        let data_entry = crate::state::models::DataEntry {
            value: crate::state::models::DataValue::Value(serialized_value),
            tags,
            metadata: serialized_metadata,
            block_height: near_sdk::env::block_height(),
        };

        // Build event using unified EventBuilder
        let metadata_value: Value = serde_json::from_slice(&data_entry.metadata).unwrap_or(Value::Object(Default::default()));
        crate::events::EventBuilder::new(crate::constants::EVENT_TYPE_DATA_UPDATE, if data_ctx.value.is_null() { "remove" } else { "set" }, data_ctx.account_id.clone())
            .with_path(data_ctx.full_path)
            .with_value(data_ctx.value.clone())
            .with_tags(json!(data_entry.tags))
            .with_structured_data(metadata_value)
            .emit(ctx.event_batch);

        // Data storage directly (no TransactionHandler wrapper)
        if data_ctx.value.is_null() {
            // Use soft delete for audit trail and storage release
            if let Some(entry) = self.get_entry(data_ctx.full_path) {
                crate::storage::soft_delete_entry(self, data_ctx.full_path, entry)?;
            }
            // If entry doesn't exist, deletion is idempotent (no-op)
        } else {
            // Use insert_entry_with_fallback to enable attached deposit as final fallback
            // Priority: Platform Pool → Shared Pool → Personal Balance → Attached Deposit
            self.insert_entry_with_fallback(data_ctx.full_path, data_entry, ctx.attached_balance.as_deref_mut())?;
        }

        ctx.success_paths.push(data_ctx.full_path.to_string());
        Ok(())
    }

    /// Handle API data operations (regular paths)
    pub(crate) fn handle_api_data_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        predecessor: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        // Ensure account has storage coverage for data operations
        if !ctx.processed_accounts.contains(account_id) {
            let storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
            
            // PLATFORM-FIRST PRIORITY ORDER:
            // 1. Platform pool (if pool has funds) → FREE for everyone
            // 2. Group shared storage → Sponsor pays
            // 3. User's existing personal balance → User's reserve
            // 4. User's attached deposit → Pay-as-you-go fallback
            //
            // This maximizes adoption by making platform sponsorship the default
            // Users with their own balance benefit too (their balance is preserved)
            // Platform sponsorship is automatically enabled when pool has funds.
            
            let already_sponsored = storage.platform_sponsored;
            let has_shared = storage.shared_storage.is_some();
            let has_personal_balance = storage.balance > 0;
            
            // Priority 1: Try platform sponsorship first (best UX - free for user)
            // Auto-enabled when platform pool has funds (no config toggle needed)
            let platform_account = Self::platform_pool_account();
            let pool = self.shared_storage_pools.get(&platform_account).cloned().unwrap_or_default();
            let pool_has_funds = pool.storage_balance > 0 && pool.available_bytes() > 0;
            
            if pool_has_funds && !already_sponsored {
                // Platform pool has capacity - mark user as sponsored
                // This works even if user has their own balance (preserves it)
                let mut new_storage = storage.clone();
                new_storage.platform_sponsored = true;
                new_storage.storage_tracker.reset();
                self.user_storage.insert(account_id.clone(), new_storage);
                
                // Emit event for platform sponsorship activation
                crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                    "platform_sponsor",
                    account_id.clone()
                )
                .with_field("pool_account", platform_account.to_string())
                .emit(ctx.event_batch);
                
                ctx.processed_accounts.insert(account_id.clone());
                // Continue to process - user is now sponsored
            } else if !pool_has_funds && !already_sponsored && !has_shared && !has_personal_balance {
                // Pool empty and user has no other coverage
                // Fall through to check attached deposit
                if *ctx.attached_balance > 0 {
                    // User attached deposit - use it as fallback
                    let deposit_amount = *ctx.attached_balance;
                    let mut new_storage = storage;
                    new_storage.balance = new_storage.balance.saturating_add(deposit_amount);
                    new_storage.storage_tracker.reset();
                    self.user_storage.insert(account_id.clone(), new_storage);
                    *ctx.attached_balance = 0;
                }
                // If no deposit either, operation will fail with "insufficient storage"
                ctx.processed_accounts.insert(account_id.clone());
            } else if !pool_has_funds && !already_sponsored && (has_shared || has_personal_balance) {
                // Pool empty but user has shared or personal coverage
                ctx.processed_accounts.insert(account_id.clone());
            } else if already_sponsored || has_shared || has_personal_balance {
                // Priority 2-3: Already has coverage (sponsored, shared, or personal)
                ctx.processed_accounts.insert(account_id.clone());
            } else if *ctx.attached_balance > 0 {
                // Priority 4: No coverage, but user attached deposit (pay-as-you-go)
                let deposit_amount = *ctx.attached_balance;
                let mut new_storage = storage;
                new_storage.balance = new_storage.balance.saturating_add(deposit_amount);
                new_storage.storage_tracker.reset();
                self.user_storage.insert(account_id.clone(), new_storage);
                *ctx.attached_balance = 0;
                ctx.processed_accounts.insert(account_id.clone());
            } else {
                // No coverage at all - operation will fail
                ctx.processed_accounts.insert(account_id.clone());
            }
        }

        // Process the data operation
        let mut success_paths = vec![];
        let mut errors = vec![];
        let mut op_ctx = OperationContext {
            event_batch: ctx.event_batch,
            success_paths: &mut success_paths,
            errors: &mut errors,
            attached_balance: Some(ctx.attached_balance),
        };
        self.process_operation(path, value, account_id, predecessor, &mut op_ctx)?;

        // Return first error if any occurred
        if !errors.is_empty() {
            return Err(errors.into_iter().next().unwrap());
        }

        Ok(())
    }
}