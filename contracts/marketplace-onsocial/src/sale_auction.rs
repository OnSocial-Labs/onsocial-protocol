//! English auction subsystem — list, bid, settle, cancel auctions
//! for native scarce tokens.

use crate::*;
use near_sdk::json_types::U128;

// ── Internal auction helpers ─────────────────────────────────────────────────

impl Contract {
    /// List a native scarce for English auction.
    pub(crate) fn internal_list_native_scarce_auction(
        &mut self,
        owner_id: &AccountId,
        token_id: &str,
        params: AuctionListing,
    ) -> Result<(), MarketplaceError> {
        let AuctionListing {
            reserve_price,
            min_bid_increment,
            expires_at,
            auction_duration_ns,
            anti_snipe_extension_ns,
            buy_now_price,
        } = params;
        let reserve_price = reserve_price.0;
        let min_bid_increment = min_bid_increment.0;
        let buy_now_price = buy_now_price.map(|p| p.0);

        // Validate the token
        let token = self
            .scarces_by_id
            .get(token_id)
            .ok_or_else(|| MarketplaceError::NotFound("Token not found".into()))?;
        if &token.owner_id != owner_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the token owner can list".into(),
            ));
        }
        if token.revoked_at.is_some() {
            return Err(MarketplaceError::InvalidState(
                "Cannot auction a revoked token".into(),
            ));
        }

        // Block soulbound (non-transferable) tokens.
        self.check_transferable(token, token_id, "auction")?;

        // Grab app_id before dropping the immutable borrow.
        let token_app_id = token.app_id.clone();

        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        if self.sales.contains_key(&sale_id) {
            return Err(MarketplaceError::InvalidState(
                "Token is already listed".into(),
            ));
        }

        // Must have either a fixed expiry or an auction_duration_ns (Foundation-style)
        if expires_at.is_none() && auction_duration_ns.is_none() {
            return Err(MarketplaceError::InvalidInput(
                "Auction needs either expires_at or auction_duration_ns".into(),
            ));
        }
        if let Some(exp) = expires_at {
            if exp <= env::block_timestamp() {
                return Err(MarketplaceError::InvalidInput(
                    "expires_at must be in the future".into(),
                ));
            }
        }
        if let Some(bnp) = buy_now_price {
            if bnp <= reserve_price {
                return Err(MarketplaceError::InvalidInput(
                    "buy_now_price must exceed reserve_price".into(),
                ));
            }
        }

        let auction = AuctionState {
            reserve_price,
            min_bid_increment,
            highest_bid: 0,
            highest_bidder: None,
            bid_count: 0,
            auction_duration_ns,
            anti_snipe_extension_ns,
            buy_now_price,
        };

        let sale = Sale {
            owner_id: owner_id.clone(),
            sale_conditions: U128(reserve_price),
            sale_type: SaleType::NativeScarce {
                token_id: token_id.to_string(),
            },
            expires_at,
            auction: Some(auction),
        };

        let before = env::storage_usage();
        self.internal_add_sale(sale);
        let after = env::storage_usage();
        let bytes_used = after.saturating_sub(before);

        // Standalone tokens carry their own app_id; collection tokens inherit.
        let app_id = self.resolve_token_app_id(token_id, token_app_id.as_ref());
        self.charge_storage_waterfall(owner_id, bytes_used as u64, app_id.as_ref())?;

        events::emit_auction_created(owner_id, token_id, reserve_price, buy_now_price);
        Ok(())
    }

    /// Settle a completed auction. Anyone may call once the timer has expired.
    /// When `force_settle` is true, the expiry check is skipped (used by buy-now).
    pub(crate) fn internal_settle_auction(
        &mut self,
        _actor_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        self.internal_settle_auction_impl(_actor_id, token_id, false)
    }

    /// Settle an auction immediately (buy-now path). Skips the expiry check.
    pub(crate) fn internal_settle_auction_buynow(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        self.internal_settle_auction_impl(actor_id, token_id, true)
    }

    fn internal_settle_auction_impl(
        &mut self,
        _actor_id: &AccountId,
        token_id: &str,
        force_settle: bool,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .cloned()
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        let auction = sale
            .auction
            .as_ref()
            .ok_or_else(|| MarketplaceError::InvalidState("Not an auction listing".into()))?;

        if !force_settle {
            // Must be past expiry (for Foundation-style, expires_at is set on first bid)
            let expires = sale.expires_at.ok_or_else(|| {
                MarketplaceError::InvalidState("Auction has no expiry yet (no bids placed)".into())
            })?;
            if env::block_timestamp() < expires {
                return Err(MarketplaceError::InvalidState(
                    "Auction has not ended yet".into(),
                ));
            }
        }

        let seller_id = sale.owner_id.clone();
        let winning_bid = auction.highest_bid;
        let winner = auction.highest_bidder.clone();

        // Remove the sale first (reentrancy protection)
        self.internal_remove_sale(env::current_account_id(), token_id.to_string())?;

        if winning_bid >= auction.reserve_price && winning_bid > 0 {
            // Reserve met → transfer NFT to winner, pay seller
            let winner_id = winner.ok_or_else(|| {
                MarketplaceError::InternalError("highest_bid > 0 but no bidder".into())
            })?;

            self.internal_transfer(
                &seller_id,
                &winner_id,
                token_id,
                None,
                Some("Auction settled on OnSocial Marketplace".to_string()),
            )?;

            let result = self.settle_secondary_sale(token_id, winning_bid, &seller_id)?;

            events::emit_auction_settled(
                &winner_id,
                &seller_id,
                token_id,
                winning_bid,
                result.revenue,
                result.app_pool_amount,
            );
        } else {
            // Reserve not met (or no bids) → refund highest bidder if any
            if let Some(bidder) = winner {
                if winning_bid > 0 {
                    let _ = Promise::new(bidder.clone())
                        .transfer(NearToken::from_yoctonear(winning_bid));
                }
            }
            events::emit_auction_cancelled(&seller_id, token_id, "reserve_not_met");
        }
        Ok(())
    }

    /// Cancel an auction. Seller only, only if no bids have been placed.
    pub(crate) fn internal_cancel_auction(
        &mut self,
        actor_id: &AccountId,
        token_id: &str,
    ) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), token_id);
        let sale = self
            .sales
            .get(&sale_id)
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;

        if &sale.owner_id != actor_id {
            return Err(MarketplaceError::Unauthorized(
                "Only the seller can cancel".into(),
            ));
        }
        let auction = sale
            .auction
            .as_ref()
            .ok_or_else(|| MarketplaceError::InvalidState("Not an auction listing".into()))?;
        if auction.bid_count != 0 {
            return Err(MarketplaceError::InvalidState(
                "Cannot cancel auction with active bids".into(),
            ));
        }

        self.internal_remove_sale(env::current_account_id(), token_id.to_string())?;
        events::emit_auction_cancelled(actor_id, token_id, "seller_cancelled");
        Ok(())
    }
}

// ── Place Bid (payable, standalone method) ───────────────────────────────────

#[near]
impl Contract {
    /// Place a bid on an active English auction. Attached deposit = bid amount.
    #[payable]
    #[handle_result]
    pub fn place_bid(&mut self, token_id: String) -> Result<(), MarketplaceError> {
        let sale_id = Contract::make_sale_id(&env::current_account_id(), &token_id);
        let mut sale = self
            .sales
            .get(&sale_id)
            .cloned()
            .ok_or_else(|| MarketplaceError::NotFound("No sale found".into()))?;
        let mut auction = sale
            .auction
            .clone()
            .ok_or_else(|| MarketplaceError::InvalidState("Not an auction listing".into()))?;

        let bidder = env::predecessor_account_id();
        let bid = env::attached_deposit().as_yoctonear();

        if bidder == sale.owner_id {
            return Err(MarketplaceError::InvalidInput(
                "Seller cannot bid on own auction".into(),
            ));
        }

        // If Foundation-style (no initial expires_at), first qualifying bid starts the timer
        if sale.expires_at.is_none() {
            let duration = auction.auction_duration_ns.ok_or_else(|| {
                MarketplaceError::InvalidState("Auction has no expiry and no duration".into())
            })?;
            if bid < auction.reserve_price {
                return Err(MarketplaceError::InsufficientDeposit(
                    "First bid must meet the reserve price".into(),
                ));
            }
            sale.expires_at = Some(env::block_timestamp() + duration);
        }

        let expires = sale.expires_at.unwrap();
        if env::block_timestamp() >= expires {
            return Err(MarketplaceError::InvalidState("Auction has ended".into()));
        }

        // Validate bid amount
        let min_required = if auction.highest_bid == 0 {
            // First bid on a timed auction: just needs min_bid_increment (or reserve if set)
            auction.reserve_price.max(auction.min_bid_increment)
        } else {
            auction.highest_bid + auction.min_bid_increment
        };
        if bid < min_required {
            return Err(MarketplaceError::InsufficientDeposit(format!(
                "Bid too low: minimum {} yoctoNEAR required",
                min_required
            )));
        }

        // Refund previous highest bidder
        let prev_bidder = auction.highest_bidder.clone();
        let prev_bid = auction.highest_bid;
        if let Some(ref prev) = prev_bidder {
            if prev_bid > 0 {
                let _ = Promise::new(prev.clone()).transfer(NearToken::from_yoctonear(prev_bid));
            }
        }

        // Update auction state
        auction.highest_bid = bid;
        auction.highest_bidder = Some(bidder.clone());
        auction.bid_count += 1;

        // Anti-snipe extension
        if auction.anti_snipe_extension_ns > 0 {
            let time_left = expires.saturating_sub(env::block_timestamp());
            if time_left < auction.anti_snipe_extension_ns {
                sale.expires_at = Some(expires + auction.anti_snipe_extension_ns);
            }
        }

        sale.auction = Some(auction.clone());

        // Persist updated sale
        self.sales.insert(sale_id, sale);

        events::emit_auction_bid(&bidder, &token_id, bid, auction.bid_count);

        // Buy-now: if bid >= buy_now_price, settle immediately (skip expiry check)
        if let Some(bnp) = auction.buy_now_price {
            if bid >= bnp {
                self.internal_settle_auction_buynow(&bidder, &token_id)?;
            }
        }
        Ok(())
    }
}
