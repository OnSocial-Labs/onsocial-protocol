// Storage management for marketplace

use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
    /// Deposit storage for listing NFTs
    /// Users must deposit storage before listing NFTs
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) {
        let storage_account_id = account_id.unwrap_or_else(|| env::predecessor_account_id());
        let deposit = env::attached_deposit();
        
        assert!(
            deposit.as_yoctonear() > 0,
            "Requires attached deposit of at least 1 yoctoNEAR"
        );
        
        // Get current balance
        let current_balance = self.internal_storage_balance_of(&storage_account_id);
        
        // Add deposit to balance
        let new_balance = current_balance + deposit.as_yoctonear();
        
        // Update storage
        self.storage_deposits.insert(storage_account_id.clone(), new_balance);
        
        // Emit OnSocial event
        crate::events::emit_storage_deposit_event(
            &storage_account_id,
            deposit.as_yoctonear(),
            new_balance,
        );
        
        env::log_str(&format!(
            "Storage deposit: {} deposited {} yoctoNEAR. New balance: {}",
            storage_account_id, deposit.as_yoctonear(), new_balance
        ));
    }
    
    /// Withdraw excess storage deposit
    /// Can only withdraw storage not being used for active sales
    pub fn storage_withdraw(&mut self) {
        let owner_id = env::predecessor_account_id();
        let current_balance = self.internal_storage_balance_of(&owner_id);
        
        assert!(current_balance > 0, "No storage balance to withdraw");
        
        // Calculate storage being used
        let sales_count = self.get_supply_by_owner_id(owner_id.clone());
        let storage_used = (sales_count as u128) * STORAGE_PER_SALE;
        
        // Calculate available for withdrawal
        let available = current_balance.saturating_sub(storage_used);
        
        assert!(available > 0, "No storage available to withdraw");
        
        // Update balance
        let new_balance = current_balance - available;
        if new_balance == 0 {
            self.storage_deposits.remove(&owner_id);
        } else {
            self.storage_deposits.insert(owner_id.clone(), new_balance);
        }
        
        // Transfer back to user
        Promise::new(owner_id.clone()).transfer(NearToken::from_yoctonear(available));
        
        // Emit OnSocial event
        crate::events::emit_storage_withdraw_event(
            &owner_id,
            available,
            new_balance,
        );
        
        env::log_str(&format!(
            "Storage withdraw: {} withdrew {} yoctoNEAR. New balance: {}",
            owner_id, available, new_balance
        ));
    }
    
    /// Get minimum storage balance needed for one sale
    pub fn storage_minimum_balance(&self) -> U128 {
        U128(STORAGE_PER_SALE)
    }
    
    /// Get storage balance for an account
    pub fn storage_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.internal_storage_balance_of(&account_id))
    }
    
    /// Check if account has enough storage for one sale
    pub(crate) fn assert_storage_available(&self, account_id: &AccountId) {
        let current_balance = self.internal_storage_balance_of(account_id);
        let sales_count = self.get_supply_by_owner_id(account_id.clone());
        let storage_used = (sales_count as u128) * STORAGE_PER_SALE;
        let storage_available = current_balance.saturating_sub(storage_used);
        
        assert!(
            storage_available >= STORAGE_PER_SALE,
            "Insufficient storage. Please deposit {} yoctoNEAR using storage_deposit",
            STORAGE_PER_SALE
        );
    }
}
