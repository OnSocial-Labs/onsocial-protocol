//! Storage management for marketplace with auto-sponsor support.

use crate::*;

#[near]
impl Contract {
    /// Deposit storage for listing scarces.
    /// Users must deposit storage before listing (or be auto-sponsored).
    #[payable]
    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) {
        let storage_account_id = account_id.unwrap_or_else(|| env::predecessor_account_id());
        let deposit = env::attached_deposit();

        assert!(
            deposit.as_yoctonear() > 0,
            "Requires attached deposit of at least 1 yoctoNEAR"
        );

        let current_balance = self.internal_storage_balance_of(&storage_account_id);
        let new_balance = current_balance + deposit.as_yoctonear();

        self.storage_deposits
            .insert(storage_account_id.clone(), new_balance);

        events::emit_storage_deposit(
            &storage_account_id,
            deposit.as_yoctonear(),
            new_balance,
        );
    }

    /// Withdraw excess storage deposit.
    /// Can only withdraw storage not being used for active sales.
    pub fn storage_withdraw(&mut self) {
        let owner_id = env::predecessor_account_id();
        let current_balance = self.internal_storage_balance_of(&owner_id);

        assert!(current_balance > 0, "No storage balance to withdraw");

        let sales_count = self.get_supply_by_owner_id(owner_id.clone());
        let storage_used = (sales_count as u128) * STORAGE_PER_SALE;
        let available = current_balance.saturating_sub(storage_used);

        assert!(available > 0, "No storage available to withdraw");

        let new_balance = current_balance - available;
        if new_balance == 0 {
            self.storage_deposits.remove(&owner_id);
        } else {
            self.storage_deposits.insert(owner_id.clone(), new_balance);
        }

        let _ = Promise::new(owner_id.clone()).transfer(NearToken::from_yoctonear(available));

        events::emit_storage_withdraw(&owner_id, available, new_balance);
    }

    pub fn storage_minimum_balance(&self) -> U128 {
        U128(STORAGE_PER_SALE)
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.internal_storage_balance_of(&account_id))
    }

    /// Check if account has enough storage for one sale.
    /// If not, attempt auto-sponsor from the fund before failing.
    pub(crate) fn assert_storage_available(&mut self, account_id: &AccountId) {
        let current_balance = self.internal_storage_balance_of(account_id);
        let sales_count = self.get_supply_by_owner_id(account_id.clone());
        let storage_used = (sales_count as u128) * STORAGE_PER_SALE;
        let storage_available = current_balance.saturating_sub(storage_used);

        if storage_available >= STORAGE_PER_SALE {
            return; // Already enough
        }

        // Try auto-sponsor
        let sponsored = self.try_auto_sponsor(account_id);
        if sponsored > 0 {
            // Re-check after sponsorship
            let new_balance = self.internal_storage_balance_of(account_id);
            let new_available = new_balance.saturating_sub(storage_used);
            if new_available >= STORAGE_PER_SALE {
                return;
            }
        }

        panic!(
            "Insufficient storage. Deposit {} yoctoNEAR via storage_deposit()",
            STORAGE_PER_SALE
        );
    }
}
