//! Sponsor fund management — auto-deposit storage for new users from sales revenue.

use crate::*;

#[near]
impl Contract {
    // ── Sponsor Fund Views ───────────────────────────────────────────────

    /// Check if an account is eligible for sponsored storage.
    /// Eligible = has no manual storage deposit AND has not been fully sponsored.
    pub fn is_eligible_for_sponsorship(&self, account_id: AccountId) -> bool {
        self.internal_is_eligible(&account_id)
    }

    /// Get total amount ever sponsored to an account.
    pub fn get_total_sponsored(&self, account_id: AccountId) -> U128 {
        U128(self.sponsored_accounts.get(&account_id).copied().unwrap_or(0))
    }

    // ── Sponsor Fund Admin ───────────────────────────────────────────────

    /// Owner can directly top up the sponsor fund.
    #[payable]
    pub fn top_up_sponsor_fund(&mut self) {
        let deposit = env::attached_deposit().as_yoctonear();
        assert!(deposit > 0, "Must attach NEAR");
        self.sponsor_fund_balance += deposit;
        env::log_str(&format!("Sponsor fund topped up by {}. Balance: {}", deposit, self.sponsor_fund_balance));
    }

    /// Owner can drain excess from sponsor fund to fee_recipient.
    pub fn drain_sponsor_fund(&mut self, amount: U128) -> Promise {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner_id,
            "Only contract owner"
        );
        assert!(
            amount.0 <= self.sponsor_fund_balance,
            "Insufficient sponsor fund balance"
        );
        self.sponsor_fund_balance -= amount.0;
        Promise::new(self.fee_recipient.clone()).transfer(NearToken::from_yoctonear(amount.0))
    }
}

// ── Internal helpers ─────────────────────────────────────────────────────────

impl Contract {
    /// Check eligibility: user has no manual deposit and hasn't exceeded per-user cap.
    pub(crate) fn internal_is_eligible(&self, account_id: &AccountId) -> bool {
        if self.sponsor_fund_balance == 0 {
            return false;
        }
        let already_sponsored = self.sponsored_accounts.get(account_id).copied().unwrap_or(0);
        already_sponsored < self.fee_config.max_sponsored_per_user
    }

    /// Auto-sponsor storage for an account if eligible.
    /// Called when a user needs storage but hasn't deposited.
    /// Returns the amount sponsored (0 if not eligible).
    pub(crate) fn try_auto_sponsor(&mut self, account_id: &AccountId) -> u128 {
        if !self.internal_is_eligible(account_id) {
            return 0;
        }

        let already_sponsored = self.sponsored_accounts.get(account_id).copied().unwrap_or(0);
        let remaining_allowance = self
            .fee_config
            .max_sponsored_per_user
            .saturating_sub(already_sponsored);

        let amount = STORAGE_PER_SALE.min(remaining_allowance).min(self.sponsor_fund_balance);

        if amount == 0 {
            return 0;
        }

        // Deduct from fund
        self.sponsor_fund_balance -= amount;

        // Credit the storage deposit
        let current_balance = self.internal_storage_balance_of(account_id);
        self.storage_deposits
            .insert(account_id.clone(), current_balance + amount);

        // Track sponsored amount
        self.sponsored_accounts
            .insert(account_id.clone(), already_sponsored + amount);

        events::emit_sponsor_deposit(account_id, amount, self.sponsor_fund_balance);

        env::log_str(&format!(
            "Sponsored {} yoctoNEAR storage for {}. Fund balance: {}",
            amount, account_id, self.sponsor_fund_balance
        ));

        amount
    }

    /// Route fee revenue: split between platform revenue and sponsor fund.
    /// Called during sale resolution and collection purchase.
    /// Returns (revenue_amount, sponsor_amount).
    pub(crate) fn route_fee(&mut self, price: u128) -> (u128, u128) {
        let (revenue, sponsor) = self.internal_calculate_fee_split(price);
        let (revenue, sponsor) = (revenue.0, sponsor.0);

        // Credit sponsor fund
        if sponsor > 0 {
            self.sponsor_fund_balance += sponsor;
        }

        // Transfer revenue to fee recipient
        if revenue > 0 {
            let _ = Promise::new(self.fee_recipient.clone())
                .transfer(NearToken::from_yoctonear(revenue));
        }

        (revenue, sponsor)
    }
}
