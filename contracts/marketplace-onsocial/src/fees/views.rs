//! Read-only fee views and platform storage withdrawal.

use crate::*;

#[near]
impl Contract {
    pub fn get_fee_config(&self) -> &FeeConfig {
        &self.fee_config
    }

    pub fn get_fee_recipient(&self) -> AccountId {
        self.fee_recipient.clone()
    }

    pub fn get_platform_storage_balance(&self) -> U128 {
        U128(self.platform_storage_balance)
    }

    /// Leaves at least `PLATFORM_STORAGE_MIN_RESERVE` yoctoNEAR in pool.
    #[payable]
    #[handle_result]
    pub fn withdraw_platform_storage(&mut self, amount: U128) -> Result<Promise, MarketplaceError> {
        crate::guards::check_one_yocto()?;
        self.check_contract_owner(&env::predecessor_account_id())?;
        if amount.0 > self.platform_storage_balance {
            return Err(MarketplaceError::InsufficientDeposit(
                "Amount exceeds platform storage balance".to_string(),
            ));
        }
        let remaining = self.platform_storage_balance - amount.0;
        if remaining < PLATFORM_STORAGE_MIN_RESERVE {
            return Err(MarketplaceError::InvalidInput(format!(
                "Must keep at least {} yoctoNEAR (10 NEAR) as reserve. Max withdrawable: {}",
                PLATFORM_STORAGE_MIN_RESERVE,
                self.platform_storage_balance
                    .saturating_sub(PLATFORM_STORAGE_MIN_RESERVE),
            )));
        }
        self.platform_storage_balance -= amount.0;
        Ok(Promise::new(self.owner_id.clone()).transfer(NearToken::from_yoctonear(amount.0)))
    }
}
