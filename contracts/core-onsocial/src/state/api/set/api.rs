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
    /// Optional remaining attached balance for auto-deposit fallback when pool exhausts
    pub attached_balance: Option<&'a mut u128>,
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

/// Options for the set() method
#[derive(
    near_sdk_macros::NearSchema,
    serde::Serialize,
    serde::Deserialize,
    Default,
    Clone,
)]
pub struct SetOptions {
    /// If true, refund unused deposit to the caller's wallet instead of keeping it in storage balance.
    /// Default: false (unused deposit stays in personal storage balance for future operations)
    #[serde(default)]
    pub refund_unused_deposit: bool,
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
    ///
    /// Options:
    /// - `refund_unused_deposit`: If true, refund unused deposit to wallet. If false (default),
    ///   unused deposit stays in personal storage balance for future operations.
    pub fn set(
        &mut self,
        data: Value,
        options: Option<SetOptions>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // SECURITY: Use transaction signer for permission checks to prevent permission abuse
        // If alice.near grants permission to contract.near, only alice.near can trigger writes through it
        // This prevents: bob.near → contract.near → OnSocial from using alice's permissions
        let signer = Self::transaction_signer();
        
        // For set(), the signer operates on their own account
        self.set_internal(&signer, &signer, data, options, event_config)
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
            // Storage operations - use shared attached_balance context
            "storage/deposit" => {
                self.handle_api_storage_deposit(value, account_id, ctx)
            }
            "storage/withdraw" => {
                self.handle_api_storage_withdraw(value, account_id, ctx)
            }
            "storage/shared_pool_deposit" => {
                self.handle_api_shared_pool_deposit(value, account_id, ctx)
            }
            "storage/platform_pool_deposit" => {
                self.handle_api_platform_pool_deposit(value, account_id, ctx)
            }
            "storage/share_storage" => {
                self.handle_api_share_storage(value, account_id, ctx)
            }
            "storage/return_shared_storage" => {
                self.handle_api_return_shared_storage(account_id, ctx)
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
    /// 
    /// Note: Unused deposit is stored in the signer's storage balance (not target's),
    /// since the signer is the one paying for the operation.
    pub fn set_for(
        &mut self,
        target_account: AccountId,
        data: Value,
        options: Option<SetOptions>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        // SECURITY: Use transaction signer for permission checks
        // This prevents malicious intermediary contracts from abusing delegated permissions
        let signer = Self::transaction_signer();
        
        // For set_for(), the signer operates on the target account's data
        self.set_internal(&target_account, &signer, data, options, event_config)
    }

    /// Internal implementation shared by set() and set_for()
    /// 
    /// # Arguments
    /// * `target_account` - The account whose data is being modified
    /// * `signer` - The transaction signer (used for permission checks and receives unused deposit)
    /// * `data` - JSON object with operations
    /// * `options` - Set options (refund behavior)
    /// * `event_config` - Event emission configuration
    fn set_internal(
        &mut self,
        target_account: &AccountId,
        signer: &AccountId,
        data: Value,
        options: Option<SetOptions>,
        event_config: Option<EventConfig>,
    ) -> Result<(), SocialError> {
        let options = options.unwrap_or_default();

        // Validate basic setup
        self.validate_state(false)?;
        validate_account_id(target_account)?;
        validate_account_id(signer)?;

        // Validate cross-account permissions for the entire data object
        crate::validation::validate_cross_account_permissions_simple(
            self,
            &data,
            target_account,
            signer,
        )?;

        let mut event_batch = EventBatch::new();
        let mut attached_balance = near_sdk::env::attached_deposit().as_yoctonear();
        let mut processed_accounts = std::collections::HashSet::new();

        // Process each key-value pair in the data object
        if let Some(data_obj) = data.as_object() {
            // Reject empty objects to avoid wasting gas
            if data_obj.is_empty() {
                return Err(crate::invalid_input!("Data object cannot be empty"));
            }
            
            for (key, value) in data_obj {
                let mut ctx = ApiOperationContext {
                    event_batch: &mut event_batch,
                    attached_balance: &mut attached_balance,
                    processed_accounts: &mut processed_accounts,
                };
                self.process_api_operation(
                    key,
                    value,
                    target_account,
                    signer,
                    &mut ctx,
                )?;
            }
        } else {
            return Err(crate::invalid_input!("Data must be a JSON object"));
        }

        // Handle unused deposit based on options
        if attached_balance > 0 {
            if options.refund_unused_deposit {
                // Refund unused balance to the signer's wallet
                near_sdk::Promise::new(signer.clone())
                    .transfer(near_sdk::NearToken::from_yoctonear(attached_balance))
                    .detach();
            } else {
                // Keep unused deposit in signer's personal storage balance (default)
                // This is more efficient - no separate deposit transaction needed later
                let mut storage = self.user_storage.get(signer).cloned().unwrap_or_default();
                storage.balance = storage.balance.saturating_add(attached_balance);
                self.user_storage.insert(signer.clone(), storage);
                
                // Emit event for the auto-deposit (only if we're actually saving something)
                crate::events::EventBuilder::new(
                    crate::constants::EVENT_TYPE_STORAGE_UPDATE,
                    "auto_deposit",
                    signer.clone()
                )
                .with_field("amount", attached_balance.to_string())
                .with_field("reason", "unused_deposit_saved")
                .emit(&mut event_batch);
            }
        }

        // Emit events
        event_batch.emit(&event_config)?;

        Ok(())
    }
}