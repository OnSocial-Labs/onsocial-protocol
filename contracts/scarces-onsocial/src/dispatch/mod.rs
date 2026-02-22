mod admin;
mod collections;
mod lazy_listings;
mod offers;
mod payments;
mod sales;
mod scarce;
mod withdrawals;

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(crate) fn dispatch_action(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match &action {
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
            | Action::SetCollectionAppMetadata { .. }
            | Action::WithdrawUnclaimedRefunds { .. } => {
                self.dispatch_collections(action, actor_id)
            }

            Action::ListNativeScarce { .. }
            | Action::DelistNativeScarce { .. }
            | Action::ListNativeScarceAuction { .. }
            | Action::SettleAuction { .. }
            | Action::CancelAuction { .. }
            | Action::DelistScarce { .. }
            | Action::UpdatePrice { .. } => self.dispatch_sales(action, actor_id),

            Action::AcceptOffer { .. }
            | Action::CancelOffer { .. }
            | Action::AcceptCollectionOffer { .. }
            | Action::CancelCollectionOffer { .. } => self.dispatch_offers(action, actor_id),

            Action::CreateLazyListing { .. }
            | Action::CancelLazyListing { .. }
            | Action::UpdateLazyListingPrice { .. }
            | Action::UpdateLazyListingExpiry { .. } => {
                self.dispatch_lazy_listings(action, actor_id)
            }

            Action::PurchaseFromCollection { .. }
            | Action::PurchaseLazyListing { .. }
            | Action::PurchaseNativeScarce { .. }
            | Action::PlaceBid { .. }
            | Action::MakeOffer { .. }
            | Action::MakeCollectionOffer { .. }
            | Action::CancelCollection { .. }
            | Action::FundAppPool { .. }
            | Action::StorageDeposit { .. }
            | Action::RegisterApp { .. } => self.dispatch_payments(action, actor_id),

            Action::StorageWithdraw
            | Action::WithdrawAppPool { .. }
            | Action::WithdrawPlatformStorage { .. }
            | Action::SetSpendingCap { .. } => self.dispatch_withdrawals(action, actor_id),

            Action::SetAppConfig { .. }
            | Action::TransferAppOwnership { .. }
            | Action::AddModerator { .. }
            | Action::RemoveModerator { .. }
            | Action::BanCollection { .. }
            | Action::UnbanCollection { .. } => self.dispatch_admin(action, actor_id),
        }
    }
}
