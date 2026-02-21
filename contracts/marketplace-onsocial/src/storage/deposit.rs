use crate::guards::check_one_yocto;
use crate::*;

use super::types::storage_byte_cost;

#[near]
impl Contract {
    #[payable]
    #[handle_result]
    pub fn storage_deposit(
        &mut self,
        account_id: Option<AccountId>,
    ) -> Result<(), MarketplaceError> {
        let storage_account_id = account_id.unwrap_or_else(env::predecessor_account_id);
        let deposit = env::attached_deposit().as_yoctonear();
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Requires attached deposit of at least 1 yoctoNEAR".to_string(),
            ));
        }

        let mut user = self
            .user_storage
            .get(&storage_account_id)
            .cloned()
            .unwrap_or_default();
        user.balance += deposit;
        let new_balance = user.balance;
        self.user_storage
            .insert(storage_account_id.clone(), user);

        events::emit_storage_deposit(&storage_account_id, deposit, new_balance);
        Ok(())
    }

    /// Withdraw excess storage balance; panics unless exactly 1 yoctoNEAR is attached.
    #[payable]
    #[handle_result]
    pub fn storage_withdraw(&mut self) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let owner_id = env::predecessor_account_id();
        let user = self
            .user_storage
            .get(&owner_id)
            .cloned()
            .unwrap_or_default();

        let used_cost = (user.used_bytes as u128) * storage_byte_cost();
        let available = user.balance.saturating_sub(used_cost);
        if available == 0 {
            return Err(MarketplaceError::InvalidState(
                "No storage available to withdraw".to_string(),
            ));
        }

        let new_balance = used_cost;
        if new_balance == 0 && user.used_bytes == 0 {
            self.user_storage.remove(&owner_id);
        } else {
            let mut updated = user;
            updated.balance = new_balance;
            self.user_storage.insert(owner_id.clone(), updated);
        }

        let _ = Promise::new(owner_id.clone()).transfer(NearToken::from_yoctonear(available));
        events::emit_storage_withdraw(&owner_id, available, new_balance);
        Ok(())
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> U128 {
        U128(
            self.user_storage
                .get(&account_id)
                .map(|u| u.balance)
                .unwrap_or(0),
        )
    }
}

impl Contract {
    // Routes leftover attached NEAR to refund or user balance after execute() dispatch.
    pub(crate) fn finalize_unused_deposit(
        &mut self,
        amount: u128,
        deposit_owner: &AccountId,
        options: &crate::Options,
    ) {
        if options.refund_unused_deposit {
            let _ = Promise::new(deposit_owner.clone())
                .transfer(NearToken::from_yoctonear(amount));
            events::emit_storage_refund(deposit_owner, amount);
        } else {
            let mut user = self
                .user_storage
                .get(deposit_owner)
                .cloned()
                .unwrap_or_default();
            user.balance += amount;
            let new_balance = user.balance;
            self.user_storage.insert(deposit_owner.clone(), user);
            events::emit_storage_credit_unused(deposit_owner, amount, new_balance);
        }
    }
}
