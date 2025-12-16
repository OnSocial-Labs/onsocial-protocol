// --- Storage Operations ---
use near_sdk::AccountId;
use serde_json::Value;

use crate::events::EventBuilder;
use crate::state::models::SocialPlatform;
use crate::validation::validate_account_id;
use crate::SocialError;

// --- Context Structs (shared with other modules) ---
use super::api::OperationContext;

impl SocialPlatform {
    /// Handle storage-specific operations (deposit/withdraw/shared pool)
    /// Pattern: validate first, update state, then transfer (prevents fund-locking)
    pub(crate) fn handle_storage_operation(
        &mut self,
        path: &str,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut OperationContext,
    ) -> Result<bool, SocialError> {
        if !path.starts_with("storage/") {
            return Ok(false);
        }

        let operation = crate::storage::operations::parse_storage_operation(path, value)?;
        validate_account_id(account_id)?;

        // Handle each operation type with atomic pattern (state update before transfer)
        match operation {
            crate::storage::operations::StorageOperation::Deposit { depositor, amount } => {
                // Validate depositor authorization
                crate::storage::validate_depositor(
                    &depositor,
                    account_id,
                    "deposit_operation",
                )?;
                
                // CRITICAL: Validate attached deposit BEFORE any state changes
                let attached = near_sdk::env::attached_deposit().as_yoctonear();
                if attached < amount {
                    // Refund the entire deposit since we can't process
                    if attached > 0 {
                        near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                            .transfer(near_sdk::NearToken::from_yoctonear(attached))
                            .detach();
                    }
                    return Err(crate::invalid_input!("Insufficient deposit attached"));
                }

                // Get or create storage account
                let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
                
                // Capture previous balance for event sourcing
                let previous_balance = storage.balance;
                
                // Start tracking storage changes
                storage.storage_tracker.start_tracking();
                
                // Update balance
                storage.balance = storage.balance.saturating_add(amount);
                let new_balance = storage.balance;
                
                // Stop tracking and apply changes
                storage.storage_tracker.stop_tracking();
                let delta = storage.storage_tracker.delta();
                if delta > 0 {
                    storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                    storage.assert_storage_covered()?;
                }
                storage.storage_tracker.reset();
                
                // Save state BEFORE refunding excess
                self.user_storage.insert(account_id.clone(), storage);

                // Refund excess deposit after successful state update
                let excess = attached.saturating_sub(amount);
                if excess > 0 {
                    near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                        .transfer(near_sdk::NearToken::from_yoctonear(excess))
                        .detach();
                }

                // Emit event with balance snapshots for event sourcing
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "deposit", account_id.clone())
                    .with_field("amount", amount.to_string())
                    .with_field("previous_balance", previous_balance.to_string())
                    .with_field("new_balance", new_balance.to_string())
                    .emit(ctx.event_batch);
            }
            
            crate::storage::operations::StorageOperation::Withdraw { amount, depositor } => {
                // Validate depositor authorization
                crate::storage::validate_depositor(
                    &depositor,
                    account_id,
                    "withdraw_operation",
                )?;

                // Get storage account
                let mut storage = self.user_storage.get(account_id).cloned()
                    .ok_or_else(|| crate::invalid_input!("Account not registered"))?;

                // Capture previous balance for event sourcing
                let previous_balance = storage.balance;

                // Calculate withdrawal amount
                let withdraw_amount = amount.unwrap_or(storage.balance);
                
                // Validate withdrawal amount
                crate::storage::validate_withdrawal_amount(
                    withdraw_amount,
                    storage.balance,
                    "withdraw_operation",
                )?;

                // Check available balance (accounting for used bytes)
                let used_balance = crate::storage::calculate_storage_balance_needed(
                    crate::storage::calculate_effective_bytes(
                        storage.used_bytes,
                        storage.shared_storage.as_ref().map(|s| s.used_bytes).unwrap_or(0)
                    )
                );
                let available = storage.balance.saturating_sub(used_balance);
                if withdraw_amount > available {
                    return Err(crate::invalid_input!("Withdrawal amount exceeds available balance"));
                }

                // Start tracking storage changes
                storage.storage_tracker.start_tracking();
                
                // Update balance FIRST (critical for consistency)
                storage.balance = storage.balance.saturating_sub(withdraw_amount);
                
                // Stop tracking and apply changes
                storage.storage_tracker.stop_tracking();
                let delta = storage.storage_tracker.delta();
                if delta > 0 {
                    storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                }
                storage.storage_tracker.reset();
                
                // Save state BEFORE transferring (critical for consistency)
                self.user_storage.insert(account_id.clone(), storage);

                // Transfer AFTER state update (if transfer fails, user can retry)
                if withdraw_amount > 0 {
                    near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                        .transfer(near_sdk::NearToken::from_yoctonear(withdraw_amount))
                        .detach();
                }

                // Emit event with balance snapshots for event sourcing
                let new_balance = previous_balance.saturating_sub(withdraw_amount);
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "withdraw", account_id.clone())
                    .with_field("amount", withdraw_amount.to_string())
                    .with_field("previous_balance", previous_balance.to_string())
                    .with_field("new_balance", new_balance.to_string())
                    .with_field("available_balance", available.to_string())
                    .emit(ctx.event_batch);
            }
            
            crate::storage::operations::StorageOperation::SharedPoolDeposit { pool_id, amount } => {
                // Only pool owner can deposit into their own pool
                if account_id != &pool_id {
                    return Err(crate::unauthorized!("shared_pool_deposit", account_id.as_str()));
                }
                
                // Validate attached deposit
                let attached = near_sdk::env::attached_deposit().as_yoctonear();
                if attached < amount {
                    // Refund the entire deposit
                    if attached > 0 {
                        near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                            .transfer(near_sdk::NearToken::from_yoctonear(attached))
                            .detach();
                    }
                    return Err(crate::invalid_input!("Insufficient deposit for shared pool"));
                }

                // Get or create storage for tracking
                let mut storage = self.user_storage.get(&pool_id).cloned().unwrap_or_default();

                // Start tracking storage changes
                storage.storage_tracker.start_tracking();

                // Update shared storage pool
                let mut pool = self.shared_storage_pools.get(&pool_id).cloned().unwrap_or_default();
                let previous_pool_balance = pool.storage_balance;
                pool.storage_balance = pool.storage_balance.saturating_add(amount);
                let new_pool_balance = pool.storage_balance;
                self.shared_storage_pools.insert(pool_id.clone(), pool);

                // Stop tracking and apply changes
                storage.storage_tracker.stop_tracking();
                let delta = storage.storage_tracker.delta();
                if delta > 0 {
                    storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                    storage.assert_storage_covered()?;
                }
                storage.storage_tracker.reset();

                // Save updated storage
                self.user_storage.insert(pool_id.clone(), storage);

                // Refund excess after state update
                let excess = attached.saturating_sub(amount);
                if excess > 0 {
                    near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                        .transfer(near_sdk::NearToken::from_yoctonear(excess))
                        .detach();
                }

                // Emit event with balance snapshots for event sourcing
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "pool_deposit", account_id.clone())
                    .with_field("pool_id", pool_id.to_string())
                    .with_field("amount", amount.to_string())
                    .with_field("previous_pool_balance", previous_pool_balance.to_string())
                    .with_field("new_pool_balance", new_pool_balance.to_string())
                    .emit(ctx.event_batch);
            }
            
            crate::storage::operations::StorageOperation::ShareStorage { target_id, max_bytes } => {
                self.handle_share_storage_atomic(account_id, &target_id, max_bytes, ctx.event_batch)?;
            }
            
            crate::storage::operations::StorageOperation::ReturnSharedStorage => {
                self.handle_return_shared_storage_atomic(account_id, ctx.event_batch)?;
            }
        }

        Ok(true)
    }

    /// Handle API storage deposit
    /// Pattern: validate deposit from shared context, update state
    /// Uses shared attached_balance to prevent double-counting across batch operations
    pub(crate) fn handle_api_storage_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for storage deposit"))?;

        // Validate from shared attached_balance context (not env::attached_deposit)
        // This ensures proper accounting when multiple operations are in the same batch
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit attached"));
        }

        // Deduct from shared balance BEFORE any state changes
        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        // Get or create storage account
        let mut storage = self.user_storage.get(account_id).cloned().unwrap_or_default();
        
        // Capture previous balance for event sourcing
        let previous_balance = storage.balance;
        
        // Start tracking storage changes
        storage.storage_tracker.start_tracking();
        
        // Update balance
        storage.balance = storage.balance.saturating_add(amount);
        let new_balance = storage.balance;
        
        // Stop tracking and apply changes
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            storage.assert_storage_covered()?;
        }
        storage.storage_tracker.reset();
        
        // Save state (refunds are handled by set() at the end)
        self.user_storage.insert(account_id.clone(), storage);

        EventBuilder::new(crate::constants::EVENT_TYPE_DATA_UPDATE, "storage_deposit", account_id.clone())
            .with_field("amount", amount.to_string())
            .with_field("previous_balance", previous_balance.to_string())
            .with_field("new_balance", new_balance.to_string())
            .emit(ctx.event_batch);

        Ok(())
    }

    /// Handle API storage withdraw
    /// Pattern: update state first, then transfer (enables retry if transfer fails)
    /// Uses signer for transfer destination to prevent contract intermediaries from stealing funds
    pub(crate) fn handle_api_storage_withdraw(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: Option<u128> = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok());

        // Get storage account
        let mut storage = self.user_storage.get(account_id).cloned()
            .ok_or_else(|| crate::invalid_input!("Account not registered"))?;

        // Capture previous balance for event sourcing
        let previous_balance = storage.balance;

        // Calculate withdrawal amount (None means withdraw all available)
        let withdraw_amount = amount.unwrap_or(storage.balance);

        // Calculate available balance (accounting for used bytes)
        let used_balance = crate::storage::calculate_storage_balance_needed(
            crate::storage::calculate_effective_bytes(
                storage.used_bytes,
                storage.shared_storage.as_ref().map(|s| s.used_bytes).unwrap_or(0)
            )
        );
        let available = storage.balance.saturating_sub(used_balance);

        if withdraw_amount > available {
            return Err(crate::invalid_input!("Withdrawal amount exceeds available balance"));
        }

        // Start tracking storage changes
        storage.storage_tracker.start_tracking();
        
        // Update balance FIRST (critical for consistency)
        storage.balance = storage.balance.saturating_sub(withdraw_amount);
        
        // Stop tracking and apply changes
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
        }
        storage.storage_tracker.reset();
        
        // Save state BEFORE transferring (if transfer fails, user can retry)
        self.user_storage.insert(account_id.clone(), storage);

        // Transfer AFTER state update - send to SIGNER (who owns the account)
        // Use signer, not predecessor, to prevent contract intermediaries from stealing funds
        if withdraw_amount > 0 {
            near_sdk::Promise::new(crate::state::SocialPlatform::transaction_signer())
                .transfer(near_sdk::NearToken::from_yoctonear(withdraw_amount))
                .detach();
        }

        // Calculate new balance for event
        let new_balance = previous_balance.saturating_sub(withdraw_amount);

        EventBuilder::new(crate::constants::EVENT_TYPE_DATA_UPDATE, "storage_withdraw", account_id.clone())
            .with_field("amount", withdraw_amount.to_string())
            .with_field("previous_balance", previous_balance.to_string())
            .with_field("new_balance", new_balance.to_string())
            .with_field("available_balance", available.to_string())
            .emit(ctx.event_batch);

        Ok(())
    }

    /// Handle API shared pool deposit
    /// Uses shared attached_balance to prevent double-counting across batch operations
    pub(crate) fn handle_api_shared_pool_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        let pool_id: AccountId = value
            .get("pool_id")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("pool_id required for shared_pool_deposit"))?;
        
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for shared_pool_deposit"))?;

        // Only pool owner can deposit into their own pool
        if account_id != &pool_id {
            return Err(crate::unauthorized!("shared_pool_deposit", account_id.as_str()));
        }

        // Validate from shared attached_balance context
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit for shared pool"));
        }

        // Deduct from shared balance BEFORE any state changes
        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        // Get or create storage for tracking
        let mut storage = self.user_storage.get(&pool_id).cloned().unwrap_or_default();

        // Start tracking storage changes
        storage.storage_tracker.start_tracking();

        // Update shared storage pool
        let mut pool = self.shared_storage_pools.get(&pool_id).cloned().unwrap_or_default();
        let previous_pool_balance = pool.storage_balance;
        pool.storage_balance = pool.storage_balance.saturating_add(amount);
        let new_pool_balance = pool.storage_balance;
        self.shared_storage_pools.insert(pool_id.clone(), pool);

        // Stop tracking and apply changes
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            storage.assert_storage_covered()?;
        }
        storage.storage_tracker.reset();

        // Save updated storage
        self.user_storage.insert(pool_id.clone(), storage);

        // Emit event with balance snapshots
        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "pool_deposit", account_id.clone())
            .with_field("pool_id", pool_id.to_string())
            .with_field("amount", amount.to_string())
            .with_field("previous_pool_balance", previous_pool_balance.to_string())
            .with_field("new_pool_balance", new_pool_balance.to_string())
            .emit(ctx.event_batch);

        Ok(())
    }

    /// Handle API platform pool deposit
    /// Anyone can donate to the platform pool (manager's shared pool for universal sponsorship)
    /// Uses shared attached_balance to prevent double-counting across batch operations
    pub(crate) fn handle_api_platform_pool_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for platform_pool_deposit"))?;

        // Validate from shared attached_balance context
        if *ctx.attached_balance < amount {
            return Err(crate::invalid_input!("Insufficient deposit for platform pool"));
        }

        // Deduct from shared balance BEFORE any state changes
        *ctx.attached_balance = ctx.attached_balance.saturating_sub(amount);

        // Use shared helper for the actual deposit logic
        self.platform_pool_deposit_internal(amount, account_id, ctx.event_batch)
    }

    /// Internal helper for platform pool deposit logic
    /// The platform pool is stored under the contract account (not manager) to ensure:
    /// 1. Pool persists across manager changes
    /// 2. No single person controls the community-funded pool
    /// 3. Clear separation between manager's personal funds and platform pool
    fn platform_pool_deposit_internal(
        &mut self,
        amount: u128,
        donor: &AccountId,
        event_batch: &mut crate::events::EventBatch,
    ) -> Result<(), SocialError> {
        // Platform pool is stored under contract account
        let platform_account = Self::platform_pool_account();

        // Get or create storage for tracking overhead
        let mut storage = self.user_storage.get(&platform_account).cloned().unwrap_or_default();
        storage.storage_tracker.start_tracking();

        // Update platform's shared storage pool
        let mut pool = self.shared_storage_pools.get(&platform_account).cloned().unwrap_or_default();
        let previous_pool_balance = pool.storage_balance;
        pool.storage_balance = pool.storage_balance.saturating_add(amount);
        let new_pool_balance = pool.storage_balance;
        self.shared_storage_pools.insert(platform_account.clone(), pool);

        // Stop tracking and apply changes
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            storage.assert_storage_covered()?;
        }
        storage.storage_tracker.reset();
        self.user_storage.insert(platform_account.clone(), storage);

        // Emit event with donor tracking (anyone can donate)
        EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "platform_pool_deposit", donor.clone())
            .with_field("donor", donor.to_string())
            .with_field("amount", amount.to_string())
            .with_field("previous_pool_balance", previous_pool_balance.to_string())
            .with_field("new_pool_balance", new_pool_balance.to_string())
            .emit(event_batch);

        Ok(())
    }

    /// Handle API share storage
    /// Shares storage capacity with target_id up to max_bytes
    pub(crate) fn handle_api_share_storage(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        let target_id: AccountId = value
            .get("target_id")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("target_id required for share_storage"))?;
        
        let max_bytes: u64 = value
            .get("max_bytes")
            .and_then(|v| v.as_u64())
            .ok_or_else(|| crate::invalid_input!("max_bytes required for share_storage"))?;

        self.handle_share_storage_atomic(account_id, &target_id, max_bytes, ctx.event_batch)
    }

    /// Handle API return shared storage
    /// Returns previously allocated shared storage back to the pool
    pub(crate) fn handle_api_return_shared_storage(
        &mut self,
        account_id: &AccountId,
        ctx: &mut super::api::ApiOperationContext,
    ) -> Result<(), SocialError> {
        self.handle_return_shared_storage_atomic(account_id, ctx.event_batch)
    }
}