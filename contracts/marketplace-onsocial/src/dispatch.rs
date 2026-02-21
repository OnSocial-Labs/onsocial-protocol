//! Action dispatch — maps each `Action` variant to the appropriate handler.

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    // `actor_id` is the pre-resolved caller identity (owner, delegated signer, or gas-relayed account).
    pub(crate) fn dispatch_action(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            // --- Collections ---
            Action::QuickMint { metadata, options } => {
                let token_id = self.internal_quick_mint(actor_id, metadata, options)?;
                Ok(Value::String(token_id))
            }
            Action::CreateCollection { params } => {
                self.internal_create_collection(actor_id, params)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionPrice {
                collection_id,
                new_price_near,
            } => {
                self.internal_update_collection_price(actor_id, collection_id, new_price_near)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionTiming {
                collection_id,
                start_time,
                end_time,
            } => {
                self.internal_update_collection_timing(
                    actor_id,
                    collection_id,
                    start_time,
                    end_time,
                )?;
                Ok(Value::Null)
            }
            Action::MintFromCollection {
                collection_id,
                quantity,
                receiver_id,
            } => {
                self.internal_mint_from_collection(
                    actor_id,
                    &collection_id,
                    quantity,
                    receiver_id.as_ref(),
                )?;
                Ok(Value::Null)
            }
            Action::AirdropFromCollection {
                collection_id,
                receivers,
            } => {
                self.internal_airdrop_from_collection(actor_id, &collection_id, receivers)?;
                Ok(Value::Null)
            }

            // --- Listing ---
            Action::ListNativeScarce {
                token_id,
                price,
                expires_at,
            } => {
                self.internal_list_native_scarce(actor_id, &token_id, price, expires_at)?;
                Ok(Value::Null)
            }
            Action::DelistNativeScarce { token_id } => {
                self.internal_delist_native_scarce(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::ListNativeScarceAuction { token_id, params } => {
                self.internal_list_native_scarce_auction(actor_id, &token_id, params)?;
                Ok(Value::Null)
            }
            Action::SettleAuction { token_id } => {
                self.internal_settle_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::CancelAuction { token_id } => {
                self.internal_cancel_auction(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::DelistScarce {
                scarce_contract_id,
                token_id,
            } => {
                self.internal_delist_scarce(actor_id, &scarce_contract_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::UpdatePrice {
                scarce_contract_id,
                token_id,
                price,
            } => {
                self.internal_update_price(actor_id, &scarce_contract_id, &token_id, price)?;
                Ok(Value::Null)
            }

            // --- Transfers ---
            Action::TransferScarce {
                receiver_id,
                token_id,
                memo,
            } => {
                self.internal_transfer(actor_id, &receiver_id, &token_id, None, memo)?;
                Ok(Value::Null)
            }

            // --- Approvals ---
            Action::ApproveScarce {
                token_id,
                account_id,
                msg,
            } => {
                self.internal_approve(actor_id, &token_id, &account_id, msg)?;
                Ok(Value::Null)
            }
            Action::RevokeScarce {
                token_id,
                account_id,
            } => {
                self.internal_revoke(actor_id, &token_id, &account_id)?;
                Ok(Value::Null)
            }
            Action::RevokeAllScarce { token_id } => {
                self.internal_revoke_all(actor_id, &token_id)?;
                Ok(Value::Null)
            }

            // --- Token Lifecycle ---
            Action::RenewToken {
                token_id,
                collection_id,
                new_expires_at,
            } => {
                self.internal_renew_token(actor_id, &token_id, &collection_id, new_expires_at)?;
                Ok(Value::Null)
            }
            Action::RevokeToken {
                token_id,
                collection_id,
                memo,
            } => {
                self.internal_revoke_token(actor_id, &token_id, &collection_id, memo)?;
                Ok(Value::Null)
            }
            Action::RedeemToken {
                token_id,
                collection_id,
            } => {
                self.internal_redeem_token(actor_id, &token_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::ClaimRefund {
                token_id,
                collection_id,
            } => {
                self.internal_claim_refund(actor_id, &token_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::BurnScarce {
                token_id,
                collection_id,
            } => {
                match collection_id {
                    Some(cid) => self.internal_burn_scarce(actor_id, &token_id, &cid)?,
                    None => {
                        // Empty prefix means standalone QuickMint; route to standalone burn path.
                        let cid = crate::collection_id_from_token_id(&token_id);
                        if cid.is_empty() {
                            self.internal_burn_standalone(actor_id, &token_id)?
                        } else {
                            self.internal_burn_scarce(actor_id, &token_id, cid)?
                        }
                    }
                }
                Ok(Value::Null)
            }
            Action::DeleteCollection { collection_id } => {
                self.internal_delete_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::PauseCollection { collection_id } => {
                self.internal_pause_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::ResumeCollection { collection_id } => {
                self.internal_resume_collection(actor_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::BatchTransfer { transfers } => {
                self.internal_batch_transfer(actor_id, transfers)?;
                Ok(Value::Null)
            }

            // --- Allowlist ---
            Action::SetAllowlist {
                collection_id,
                entries,
            } => {
                self.internal_set_allowlist(actor_id, &collection_id, entries)?;
                Ok(Value::Null)
            }
            Action::RemoveFromAllowlist {
                collection_id,
                accounts,
            } => {
                self.internal_remove_from_allowlist(actor_id, &collection_id, accounts)?;
                Ok(Value::Null)
            }

            // --- Admin ---
            Action::SetFeeRecipient { fee_recipient } => {
                // Requires 1 yoctoNEAR; owner only.
                crate::guards::check_one_yocto()?;
                self.check_contract_owner(actor_id)?;
                let old_recipient = self.fee_recipient.clone();
                self.fee_recipient = fee_recipient;
                events::emit_fee_recipient_changed(actor_id, &old_recipient, &self.fee_recipient);
                Ok(Value::Null)
            }
            Action::UpdateFeeConfig {
                total_fee_bps,
                app_pool_fee_bps,
                platform_storage_fee_bps,
            } => {
                // Requires 1 yoctoNEAR; owner only.
                crate::guards::check_one_yocto()?;
                self.check_contract_owner(actor_id)?;
                self.internal_update_fee_config(
                    total_fee_bps,
                    app_pool_fee_bps,
                    platform_storage_fee_bps,
                )?;
                Ok(Value::Null)
            }

            // --- App Pool ---
            Action::RegisterApp { app_id, params } => {
                self.internal_register_app(actor_id, &app_id, params)?;
                Ok(Value::Null)
            }
            Action::SetAppConfig { app_id, params } => {
                self.internal_set_app_config(actor_id, &app_id, params)?;
                Ok(Value::Null)
            }
            Action::TransferAppOwnership { app_id, new_owner } => {
                self.internal_transfer_app_ownership(actor_id, &app_id, new_owner)?;
                Ok(Value::Null)
            }
            Action::AddModerator { app_id, account_id } => {
                self.internal_add_moderator(actor_id, &app_id, account_id)?;
                Ok(Value::Null)
            }
            Action::RemoveModerator { app_id, account_id } => {
                self.internal_remove_moderator(actor_id, &app_id, &account_id)?;
                Ok(Value::Null)
            }
            Action::BanCollection {
                app_id,
                collection_id,
                reason,
            } => {
                self.internal_ban_collection(actor_id, &app_id, &collection_id, reason.as_deref())?;
                Ok(Value::Null)
            }
            Action::UnbanCollection {
                app_id,
                collection_id,
            } => {
                self.internal_unban_collection(actor_id, &app_id, &collection_id)?;
                Ok(Value::Null)
            }

            // --- Collection Metadata ---
            Action::SetCollectionMetadata {
                collection_id,
                metadata,
            } => {
                self.internal_set_collection_metadata(actor_id, &collection_id, metadata)?;
                Ok(Value::Null)
            }
            Action::SetCollectionAppMetadata {
                app_id,
                collection_id,
                metadata,
            } => {
                self.internal_set_collection_app_metadata(
                    actor_id,
                    &app_id,
                    &collection_id,
                    metadata,
                )?;
                Ok(Value::Null)
            }

            // --- Offers ---
            Action::AcceptOffer { token_id, buyer_id } => {
                self.internal_accept_offer(actor_id, &token_id, &buyer_id)?;
                Ok(Value::Null)
            }
            Action::CancelOffer { token_id } => {
                self.internal_cancel_offer(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::AcceptCollectionOffer {
                collection_id,
                token_id,
                buyer_id,
            } => {
                self.internal_accept_collection_offer(
                    actor_id,
                    &collection_id,
                    &token_id,
                    &buyer_id,
                )?;
                Ok(Value::Null)
            }
            Action::CancelCollectionOffer { collection_id } => {
                self.internal_cancel_collection_offer(actor_id, &collection_id)?;
                Ok(Value::Null)
            }

            // --- Lazy Listings ---
            Action::CreateLazyListing { params } => {
                let listing_id = self.internal_create_lazy_listing(actor_id, params)?;
                Ok(Value::String(listing_id))
            }
            Action::CancelLazyListing { listing_id } => {
                self.internal_cancel_lazy_listing(actor_id, &listing_id)?;
                Ok(Value::Null)
            }
            Action::UpdateLazyListingPrice {
                listing_id,
                new_price,
            } => {
                self.internal_update_lazy_listing_price(actor_id, &listing_id, new_price.0)?;
                Ok(Value::Null)
            }
            Action::UpdateLazyListingExpiry {
                listing_id,
                new_expires_at,
            } => {
                self.internal_update_lazy_listing_expiry(actor_id, &listing_id, new_expires_at)?;
                Ok(Value::Null)
            }
        }
    }
}
