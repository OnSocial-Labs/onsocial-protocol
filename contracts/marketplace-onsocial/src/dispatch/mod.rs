//! Action dispatch — maps each `Action` variant to the appropriate domain handler.
//!
//! Sub-modules contain the actual match arms grouped by domain:
//! - [`scarce`]         — Mint, transfer, approve, burn, lifecycle
//! - [`collections`]    — Create, update, pause, resume, delete, allowlist, metadata
//! - [`sales`]          — List, delist, auctions
//! - [`offers`]         — Accept/cancel offers (non-payment)
//! - [`lazy_listings`]  — Create, cancel, update lazy listings
//! - [`payments`]       — Purchase, bid, make-offer (consume `pending_attached_balance`)
//! - [`admin`]          — Fee config, app-pool management

mod admin;
mod collections;
mod lazy_listings;
mod offers;
mod payments;
mod sales;
mod scarce;

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    /// Route an [`Action`] to the appropriate domain sub-dispatcher.
    ///
    /// `actor_id` is the pre-resolved caller identity (owner, delegated signer,
    /// or gas-relayed account).
    pub(crate) fn dispatch_action(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match &action {
            // --- Scarce tokens ---
            Action::QuickMint { .. }
            | Action::TransferScarce { .. }
            | Action::BatchTransfer { .. }
            | Action::ApproveScarce { .. }
            | Action::RevokeScarce { .. }
            | Action::RevokeAllScarce { .. }
            | Action::BurnScarce { .. }
            | Action::RenewToken { .. }
            | Action::RevokeToken { .. }
            | Action::RedeemToken { .. }
            | Action::ClaimRefund { .. } => self.dispatch_scarce(action, actor_id),

            // --- Collections ---
            Action::CreateCollection { .. }
            | Action::UpdateCollectionPrice { .. }
            | Action::UpdateCollectionTiming { .. }
            | Action::MintFromCollection { .. }
            | Action::AirdropFromCollection { .. }
            | Action::DeleteCollection { .. }
            | Action::PauseCollection { .. }
            | Action::ResumeCollection { .. }
            | Action::SetAllowlist { .. }
            | Action::RemoveFromAllowlist { .. }
            | Action::SetCollectionMetadata { .. }
            | Action::SetCollectionAppMetadata { .. } => {
                self.dispatch_collections(action, actor_id)
            }

            // --- Sales & auctions ---
            Action::ListNativeScarce { .. }
            | Action::DelistNativeScarce { .. }
            | Action::ListNativeScarceAuction { .. }
            | Action::SettleAuction { .. }
            | Action::CancelAuction { .. }
            | Action::DelistScarce { .. }
            | Action::UpdatePrice { .. } => self.dispatch_sales(action, actor_id),

            // --- Offers (non-payment) ---
            Action::AcceptOffer { .. }
            | Action::CancelOffer { .. }
            | Action::AcceptCollectionOffer { .. }
            | Action::CancelCollectionOffer { .. } => self.dispatch_offers(action, actor_id),

            // --- Lazy listings ---
            Action::CreateLazyListing { .. }
            | Action::CancelLazyListing { .. }
            | Action::UpdateLazyListingPrice { .. }
            | Action::UpdateLazyListingExpiry { .. } => {
                self.dispatch_lazy_listings(action, actor_id)
            }

            // --- Payment actions (consume pending_attached_balance) ---
            Action::PurchaseFromCollection { .. }
            | Action::PurchaseLazyListing { .. }
            | Action::PurchaseNativeScarce { .. }
            | Action::PlaceBid { .. }
            | Action::MakeOffer { .. }
            | Action::MakeCollectionOffer { .. } => self.dispatch_payments(action, actor_id),

            // --- Admin & app-pool ---
            Action::SetFeeRecipient { .. }
            | Action::UpdateFeeConfig { .. }
            | Action::RegisterApp { .. }
            | Action::SetAppConfig { .. }
            | Action::TransferAppOwnership { .. }
            | Action::AddModerator { .. }
            | Action::RemoveModerator { .. }
            | Action::BanCollection { .. }
            | Action::UnbanCollection { .. } => self.dispatch_admin(action, actor_id),
        }
    }
}
