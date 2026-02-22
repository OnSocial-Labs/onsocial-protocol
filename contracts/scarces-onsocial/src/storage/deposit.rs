use crate::*;

use super::types::storage_byte_cost;

#[near]
impl Contract {
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
    pub(crate) fn storage_deposit(
        &mut self,
        account_id: &AccountId,
        deposit: u128,
    ) -> Result<(), MarketplaceError> {
        if deposit == 0 {
            return Err(MarketplaceError::InsufficientDeposit(
                "Requires attached deposit of at least 1 yoctoNEAR".to_string(),
            ));
        }

        let mut user = self
            .user_storage
            .get(account_id)
            .cloned()
            .unwrap_or_default();
        user.balance += deposit;
        let new_balance = user.balance;
        self.user_storage.insert(account_id.clone(), user);

        events::emit_storage_deposit(account_id, deposit, new_balance);
        Ok(())
    }

    pub(crate) fn storage_withdraw(
        &mut self,
        actor_id: &AccountId,
    ) -> Result<(), MarketplaceError> {
        let user = self
            .user_storage
            .get(actor_id)
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
            self.user_storage.remove(actor_id);
        } else {
            let mut updated = user;
            updated.balance = new_balance;
            self.user_storage.insert(actor_id.clone(), updated);
        }

        let _ = Promise::new(actor_id.clone()).transfer(NearToken::from_yoctonear(available));
        events::emit_storage_withdraw(actor_id, available, new_balance);
        Ok(())
    }
}

impl Contract {
    // Relayer funding invariant: move only non-reserved user balance into pending_attached_balance; output is the exact drawn amount.
    pub(crate) fn draw_user_balance(&mut self, actor_id: &AccountId) -> u128 {
        if let Some(user) = self.user_storage.get(actor_id).cloned() {
            let used_cost = (user.used_bytes as u128) * storage_byte_cost();
            let mut available = user.balance.saturating_sub(used_cost);
            if let Some(cap) = user.spending_cap {
                available = available.min(cap);
            }
            if available > 0 {
                let mut updated = user;
                updated.balance -= available;
                let new_balance = updated.balance;
                self.user_storage.insert(actor_id.clone(), updated);
                self.pending_attached_balance += available;
                events::emit_prepaid_balance_drawn(actor_id, available, new_balance);
                return available;
            }
        }
        0
    }

    // Accounting invariant: restore at most the previously drawn amount back into user_storage.
    pub(crate) fn restore_user_balance(
        &mut self,
        actor_id: &AccountId,
        remaining: u128,
        drawn: u128,
    ) -> u128 {
        let refund = remaining.min(drawn);
        if refund > 0 {
            let mut user = self
                .user_storage
                .get(actor_id)
                .cloned()
                .unwrap_or_default();
            user.balance += refund;
            let new_balance = user.balance;
            self.user_storage.insert(actor_id.clone(), user);
            events::emit_prepaid_balance_restored(actor_id, refund, new_balance);
        }
        remaining.saturating_sub(drawn)
    }

    pub(crate) fn set_spending_cap(&mut self, actor_id: &AccountId, cap: Option<u128>) {
        let mut user = self
            .user_storage
            .get(actor_id)
            .cloned()
            .unwrap_or_default();
        user.spending_cap = cap;
        self.user_storage.insert(actor_id.clone(), user);
        events::emit_spending_cap_set(actor_id, cap);
    }

    // Accounting invariant: finalize all unused attached deposit by refunding payer or crediting storage balance.
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
