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
            self.insert_entry(data_ctx.full_path, data_entry)?;
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
        // Ensure account has storage for data operations
        if !ctx.processed_accounts.contains(account_id) {
            let storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
            if *ctx.attached_balance > 0 {
                // Allocate the full attached deposit for automatic storage handling
                // This allows users to store data without manual deposit operations
                let deposit_amount = *ctx.attached_balance;

                let mut new_storage = storage;
                new_storage.balance = new_storage.balance.saturating_add(deposit_amount);
                self.user_storage.insert(account_id.clone(), new_storage.clone());
                // Reset any active trackers after storing
                new_storage.storage_tracker.reset();

                *ctx.attached_balance = ctx.attached_balance.saturating_sub(deposit_amount);
            }
            ctx.processed_accounts.insert(account_id.clone());
        }

        // Process the data operation
        let mut success_paths = vec![];
        let mut errors = vec![];
        let mut op_ctx = OperationContext {
            event_batch: ctx.event_batch,
            success_paths: &mut success_paths,
            errors: &mut errors,
        };
        self.process_operation(path, value, account_id, predecessor, &mut op_ctx)?;

        // Return first error if any occurred
        if !errors.is_empty() {
            return Err(errors.into_iter().next().unwrap());
        }

        Ok(())
    }
}