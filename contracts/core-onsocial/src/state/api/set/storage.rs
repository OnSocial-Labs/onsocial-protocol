// --- Storage Operations ---
use near_sdk::AccountId;
use serde_json::Value;

use crate::events::{EventBatch, EventBuilder};
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
                
                // Start tracking storage changes
                storage.storage_tracker.start_tracking();
                
                // Update balance
                storage.balance = storage.balance.saturating_add(amount);
                
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

                // Emit event
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "deposit", account_id.clone())
                    .with_field("amount", amount.to_string())
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

                // Emit event
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "withdraw", account_id.clone())
                    .with_field("amount", withdraw_amount.to_string())
                    .emit(ctx.event_batch);
            }
            
            crate::storage::operations::StorageOperation::SharedPoolDeposit { owner_id, amount } => {
                // Only pool owner can deposit into their own pool
                if account_id != &owner_id {
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
                let mut storage = self.user_storage.get(&owner_id).cloned().unwrap_or_default();

                // Start tracking storage changes
                storage.storage_tracker.start_tracking();

                // Update shared storage pool
                let mut pool = self.shared_storage_pools.get(&owner_id).cloned().unwrap_or_default();
                pool.storage_balance = pool.storage_balance.saturating_add(amount);
                self.shared_storage_pools.insert(owner_id.clone(), pool);

                // Stop tracking and apply changes
                storage.storage_tracker.stop_tracking();
                let delta = storage.storage_tracker.delta();
                if delta > 0 {
                    storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
                    storage.assert_storage_covered()?;
                }
                storage.storage_tracker.reset();

                // Save updated storage
                self.user_storage.insert(owner_id.clone(), storage);

                // Refund excess after state update
                let excess = attached.saturating_sub(amount);
                if excess > 0 {
                    near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                        .transfer(near_sdk::NearToken::from_yoctonear(excess))
                        .detach();
                }

                // Emit event
                EventBuilder::new(crate::constants::EVENT_TYPE_STORAGE_UPDATE, "pool_deposit", account_id.clone())
                    .with_field("pool_owner", owner_id.to_string())
                    .with_field("amount", amount.to_string())
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
    /// Pattern: validate deposit, update state, then refund excess
    pub(crate) fn handle_api_storage_deposit(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let amount: u128 = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok())
            .ok_or_else(|| crate::invalid_input!("amount required for storage deposit"))?;

        // Validate attached deposit BEFORE any state changes
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
        
        // Start tracking storage changes
        storage.storage_tracker.start_tracking();
        
        // Update balance
        storage.balance = storage.balance.saturating_add(amount);
        
        // Stop tracking and apply changes
        storage.storage_tracker.stop_tracking();
        let delta = storage.storage_tracker.delta();
        if delta > 0 {
            storage.used_bytes = storage.used_bytes.saturating_add(delta as u64);
            storage.assert_storage_covered()?;
        }
        storage.storage_tracker.reset();
        
        // Save state BEFORE refunding excess (critical for safety)
        self.user_storage.insert(account_id.clone(), storage);

        // Refund excess after successful state update
        let excess = attached.saturating_sub(amount);
        if excess > 0 {
            near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                .transfer(near_sdk::NearToken::from_yoctonear(excess))
                .detach();
        }

        EventBuilder::new(crate::constants::EVENT_TYPE_DATA_UPDATE, "storage_deposit", account_id.clone())
            .with_field("amount", amount.to_string())
            .emit(event_batch);

        Ok(())
    }

    /// Handle API storage withdraw
    /// Pattern: update state first, then transfer (enables retry if transfer fails)
    pub(crate) fn handle_api_storage_withdraw(
        &mut self,
        value: &Value,
        account_id: &AccountId,
        event_batch: &mut EventBatch,
    ) -> Result<(), SocialError> {
        let amount: Option<u128> = value
            .get("amount")
            .and_then(|v| v.as_str())
            .and_then(|s| s.parse().ok());

        // Get storage account
        let mut storage = self.user_storage.get(account_id).cloned()
            .ok_or_else(|| crate::invalid_input!("Account not registered"))?;

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

        // Transfer AFTER state update
        if withdraw_amount > 0 {
            near_sdk::Promise::new(near_sdk::env::predecessor_account_id())
                .transfer(near_sdk::NearToken::from_yoctonear(withdraw_amount))
                .detach();
        }

        EventBuilder::new(crate::constants::EVENT_TYPE_DATA_UPDATE, "storage_withdraw", account_id.clone())
            .with_field("amount", withdraw_amount.to_string())
            .emit(event_batch);

        Ok(())
    }
}