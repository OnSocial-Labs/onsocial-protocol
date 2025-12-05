// --- Imports ---
use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBatch;
use crate::state::models::SocialPlatform;
use crate::validation::validate_account_id;
use crate::{EventConfig, SocialError};

// --- Operation Context and Result Structs ---

/// Context shared across operation processing
pub struct OperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub success_paths: &'a mut Vec<String>,
    pub errors: &'a mut Vec<SocialError>,
}

/// Context for data operations
pub struct DataOperationContext<'a> {
    pub value: &'a Value,
    pub account_id: &'a AccountId,
    pub predecessor: &'a AccountId,
    pub full_path: &'a str,
    pub path_obj: &'a crate::utils::Path,
}

/// Context for API operations that need additional state
pub struct ApiOperationContext<'a> {
    pub event_batch: &'a mut EventBatch,
    pub attached_balance: &'a mut u128,
    pub processed_accounts: &'a mut std::collections::HashSet<AccountId>,
}

// --- Impl ---
impl SocialPlatform {
    /// Ultra-simple unified set API.
    /// Takes a JSON object where keys are paths and values are data to set.
    ///
    /// Special operation keys:
    /// - "storage/deposit": Deposit storage funds
    /// - "storage/withdraw": Withdraw storage funds
    /// - "permission/grant": Grant permissions
    /// - "permission/revoke": Revoke permissions
    /// - Regular paths: Set data (e.g., "alice.near/profile/name": "Alice")
    ///
    /// Automatic storage management - deposits are consumed automatically for data operations.
    pub fn set(
        &mut self,
        data: Value,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // SECURITY: Use transaction signer for permission checks to prevent permission abuse
        // If alice.near grants permission to contract.near, only alice.near can trigger writes through it
        // This prevents: bob.near → contract.near → OnSocial from using alice's permissions
        let signer = Self::transaction_signer();

        // Validate basic setup
        self.validate_state(false)?;
        validate_account_id(&signer)?;

        // Validate cross-account permissions for the entire data object
        // Use signer for permission checks, but track caller for contract integration scenarios
        crate::validation::validate_cross_account_permissions_simple(
            self,
            &data,
            &signer,
            &signer,
        )?;

        let mut event_batch = EventBatch::new();
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        let mut processed_accounts = std::collections::HashSet::new();

        // Process each key-value pair in the data object
        if let Some(data_obj) = data.as_object() {
            for (key, value) in data_obj {
                let mut ctx = ApiOperationContext {
                    event_batch: &mut event_batch,
                    attached_balance: &mut attached_balance,
                    processed_accounts: &mut processed_accounts,
                };
                self.process_api_operation(
                    key,
                    value,
                    &signer,  // Use signer for all operations
                    &signer,  // Signer is the authorizer
                    &mut ctx,
                )?;
            }
        } else {
            return Err(crate::invalid_input!("Data must be a JSON object"));
        }

        // Refund unused balance to the signer (who paid for the transaction)
        if attached_balance > 0 {
            near_sdk::Promise::new(signer)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance))
                .detach();
        }

        // Emit events
        event_batch.emit(&event_config)?;

        Ok(())
    }

    /// Process a single key-value operation from the API
    fn process_api_operation(
        &mut self,
        key: &str,
        value: &Value,
        account_id: &AccountId,
        predecessor: &AccountId,
        ctx: &mut ApiOperationContext,
    ) -> Result<(), SocialError> {
        match key {
            // Storage operations
            "storage/deposit" => {
                self.handle_api_storage_deposit(value, account_id, ctx.event_batch)
            }
            "storage/withdraw" => {
                self.handle_api_storage_withdraw(value, account_id, ctx.event_batch)
            }
            // Permission operations
            "permission/grant" => {
                self.handle_api_permission_grant(value, account_id, ctx.event_batch)
            }
            "permission/revoke" => {
                self.handle_api_permission_revoke(value, account_id, ctx.event_batch)
            }
            // Regular data paths
            path if path.contains('/') => {
                self.handle_api_data_operation(path, value, account_id, predecessor, ctx)
            }
            _ => {
                Err(crate::invalid_input!("Invalid operation key"))
            }
        }
    }

    /// Set data for another account (requires permission)
    /// SECURITY: Uses transaction signer for permission checks to prevent abuse
    pub fn set_for(
        &mut self,
        target_account: AccountId,
        data: Value,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // SECURITY: Use transaction signer for permission checks
        // This prevents malicious intermediary contracts from abusing delegated permissions
        let signer = Self::transaction_signer();

        // Validate basic setup
        self.validate_state(false)?;
        validate_account_id(&target_account)?;
        validate_account_id(&signer)?;

        // Validate cross-account permissions for the entire data object
        // Use signer as the authorizer, not the intermediary contract
        crate::validation::validate_cross_account_permissions_simple(
            self,
            &data,
            &target_account,
            &signer,
        )?;

        let mut event_batch = EventBatch::new();
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        let mut processed_accounts = std::collections::HashSet::new();

        // Process each key-value pair in the data object
        if let Some(data_obj) = data.as_object() {
            for (key, value) in data_obj {
                let mut ctx = ApiOperationContext {
                    event_batch: &mut event_batch,
                    attached_balance: &mut attached_balance,
                    processed_accounts: &mut processed_accounts,
                };
                self.process_api_operation(
                    key,
                    value,
                    &target_account,
                    &signer,  // Use signer as authorizer
                    &mut ctx,
                )?;
            }
        } else {
            return Err(crate::invalid_input!("Data must be a JSON object"));
        }

        // Refund unused balance to the signer (who paid for the transaction)
        if attached_balance > 0 {
            near_sdk::Promise::new(signer)
                .transfer(near_sdk::NearToken::from_yoctonear(attached_balance))
                .detach();
        }

        // Emit events
        event_batch.emit(&event_config)?;

        Ok(())
    }
}