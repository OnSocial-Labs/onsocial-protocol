//! Collection cancellation & refund system.
//!
//! Pull-based refund pattern: organizer deposits NEAR on cancel,
//! each holder calls `claim_refund()` individually.

use crate::internal::check_one_yocto;
use crate::*;

/// Default refund claim window: 90 days in nanoseconds.
const DEFAULT_REFUND_DEADLINE_NS: u64 = 90 * 24 * 60 * 60 * 1_000_000_000;

/// Minimum refund claim window: 7 days in nanoseconds.
/// Prevents authorities from setting a near-zero deadline and immediately
/// withdrawing the refund pool before holders have a chance to claim.
const MIN_REFUND_DEADLINE_NS: u64 = 7 * 24 * 60 * 60 * 1_000_000_000;

// ── Public payable methods ───────────────────────────────────────────────────

#[near]
impl Contract {
    /// Cancel a collection and deposit NEAR for refunds.
    ///
    /// The organizer specifies `refund_per_token` and must attach at least
    /// `refund_per_token * refundable_count` NEAR.
    ///
    /// Refundable tokens = minted - redeemed (already-used tickets don't qualify).
    /// Each holder calls `claim_refund()` individually (pull-based, gas-safe).
    /// After `refund_deadline` the organizer can withdraw unclaimed funds.
    #[payable]
    #[handle_result]
    pub fn cancel_collection(
        &mut self,
        collection_id: String,
        refund_per_token: U128,
        refund_deadline_ns: Option<u64>,
    ) -> Result<(), MarketplaceError> {
        let caller = env::predecessor_account_id();
        let deposit = env::attached_deposit().as_yoctonear();

        let mut collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(&caller, &collection)?;

        if collection.cancelled {
            return Err(MarketplaceError::InvalidState("Collection is already cancelled".into()));
        }

        let refundable_count = collection.minted_count.saturating_sub(collection.fully_redeemed_count);
        let required_deposit = refund_per_token.0 * refundable_count as u128;

        if deposit < required_deposit {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Insufficient deposit: need {} for {} refundable tokens at {} each, got {}",
                required_deposit, refundable_count, refund_per_token.0, deposit
            )));
        }

        collection.cancelled = true;
        collection.refund_pool = deposit;
        collection.refund_per_token = refund_per_token.0;
        let deadline = refund_deadline_ns.unwrap_or(DEFAULT_REFUND_DEADLINE_NS);
        if deadline < MIN_REFUND_DEADLINE_NS {
            return Err(MarketplaceError::InvalidInput(format!(
                "Refund deadline must be at least 7 days ({} ns), got {}",
                MIN_REFUND_DEADLINE_NS, deadline
            )));
        }
        collection.refund_deadline = Some(env::block_timestamp().saturating_add(deadline));

        self.collections.insert(collection_id.clone(), collection);

        events::emit_collection_cancelled(
            &caller,
            &collection_id,
            refund_per_token.0,
            deposit,
            refundable_count,
        );
        Ok(())
    }

    #[payable]
    #[handle_result]
    pub fn claim_refund(&mut self, token_id: String, collection_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();
        self.internal_claim_refund(&caller, &token_id, &collection_id)
    }

    #[payable]
    #[handle_result]
    pub fn withdraw_unclaimed_refunds(&mut self, collection_id: String) -> Result<(), MarketplaceError> {
        check_one_yocto()?;
        let caller = env::predecessor_account_id();

        let mut collection = self
            .collections
            .get(&collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        self.check_collection_authority(&caller, &collection)?;

        if !collection.cancelled {
            return Err(MarketplaceError::InvalidState("Collection is not cancelled".into()));
        }

        if let Some(deadline) = collection.refund_deadline {
            if env::block_timestamp() < deadline {
                return Err(MarketplaceError::InvalidState(
                    "Refund deadline has not passed yet".into(),
                ));
            }
        }

        let remaining = collection.refund_pool;
        if remaining == 0 {
            return Err(MarketplaceError::InvalidState("No funds remaining in refund pool".into()));
        }

        collection.refund_pool = 0;
        self.collections.insert(collection_id.clone(), collection);

        let _ = Promise::new(caller.clone())
            .transfer(NearToken::from_yoctonear(remaining));

        events::emit_refund_pool_withdrawn(&caller, &collection_id, remaining);
        Ok(())
    }
}

// ── Internal refund logic ────────────────────────────────────────────────────

impl Contract {
    pub(crate) fn internal_claim_refund(
        &mut self,
        caller: &AccountId,
        token_id: &str,
        collection_id: &str,
    ) -> Result<(), MarketplaceError> {
        check_token_in_collection(token_id, collection_id)?;

        let mut collection = self
            .collections
            .get(collection_id)
            .ok_or_else(|| MarketplaceError::NotFound("Collection not found".into()))?
            .clone();

        if !collection.cancelled {
            return Err(MarketplaceError::InvalidState("Collection is not cancelled".into()));
        }

        let mut token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?
            .clone();

        if &token.owner_id != caller {
            return Err(MarketplaceError::Unauthorized(
                "Only the token holder can claim a refund".into(),
            ));
        }

        if token.refunded {
            return Err(MarketplaceError::InvalidState("Refund already claimed for this token".into()));
        }

        // Block refund for fully-redeemed tokens
        if let Some(max) = collection.max_redeems {
            if token.redeem_count >= max {
                return Err(MarketplaceError::InvalidState(
                    "Cannot claim refund for a fully redeemed token".into(),
                ));
            }
        }

        let refund_amount = collection.refund_per_token;
        if collection.refund_pool < refund_amount {
            return Err(MarketplaceError::InvalidState(
                "Refund pool exhausted — contact the organizer".into(),
            ));
        }

        // Mark token as refunded
        token.refunded = true;
        self.scarces_by_id.insert(token_id.to_string(), token);

        // Deduct from pool
        collection.refund_pool -= refund_amount;
        collection.refunded_count += 1;
        self.collections.insert(collection_id.to_string(), collection);

        // Transfer refund
        let _ = Promise::new(caller.clone())
            .transfer(NearToken::from_yoctonear(refund_amount));

        events::emit_refund_claimed(caller, token_id, collection_id, refund_amount);
        Ok(())
    }
}
