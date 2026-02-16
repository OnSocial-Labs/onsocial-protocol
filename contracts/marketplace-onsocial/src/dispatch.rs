//! Action dispatch — maps each `Action` variant to the appropriate handler.

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(crate) fn dispatch_action(&mut self, action: Action, actor_id: &AccountId) -> Result<Value, MarketplaceError> {
        match action {
            // ── Collections ──────────────────────────────────────────
            Action::CreateCollection { params } => {
                self.internal_create_collection(actor_id, params)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionPrice { collection_id, new_price_near } => {
                self.internal_update_collection_price(actor_id, collection_id, new_price_near)?;
                Ok(Value::Null)
            }
            Action::UpdateCollectionTiming { collection_id, start_time, end_time } => {
                self.internal_update_collection_timing(actor_id, collection_id, start_time, end_time)?;
                Ok(Value::Null)
            }
            Action::MintFromCollection { collection_id, quantity, receiver_id } => {
                self.internal_mint_from_collection(actor_id, &collection_id, quantity, receiver_id.as_ref())?;
                Ok(Value::Null)
            }
            Action::AirdropFromCollection { collection_id, receivers } => {
                self.internal_airdrop_from_collection(actor_id, &collection_id, receivers)?;
                Ok(Value::Null)
            }

            // ── Listing ──────────────────────────────────────────────
            Action::ListNativeScarce { token_id, price, expires_at } => {
                self.internal_list_native_scarce(actor_id, &token_id, price, expires_at)?;
                Ok(Value::Null)
            }
            Action::DelistNativeScarce { token_id } => {
                self.internal_delist_native_scarce(actor_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::ListNativeScarceAuction {
                token_id,
                params,
            } => {
                self.internal_list_native_scarce_auction(
                    actor_id,
                    &token_id,
                    params,
                )?;
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
            // NOTE: ListScarce requires cross-contract verification, so it cannot
            // be fully resolved in execute(). The actor must still use the
            // #[payable] list_scarce_for_sale() method with deposit.
            // We handle the gasless-compatible actions here.
            Action::ListScarce { .. } => {
                Err(MarketplaceError::InvalidInput(
                    "ListScarce requires cross-contract approval checks. \
                     Use list_scarce_for_sale() with attached deposit instead.".into(),
                ))
            }
            Action::DelistScarce { scarce_contract_id, token_id } => {
                self.internal_delist_scarce(actor_id, &scarce_contract_id, &token_id)?;
                Ok(Value::Null)
            }
            Action::UpdatePrice { scarce_contract_id, token_id, price } => {
                self.internal_update_price(actor_id, &scarce_contract_id, &token_id, price)?;
                Ok(Value::Null)
            }

            // ── Transfers ────────────────────────────────────────────
            Action::TransferScarce { receiver_id, token_id, memo } => {
                self.internal_transfer(actor_id, &receiver_id, &token_id, None, memo.clone())?;
                events::emit_scarce_transfer(
                    actor_id, &receiver_id, &token_id, memo.as_deref(),
                );
                Ok(Value::Null)
            }

            // ── Approvals ────────────────────────────────────────────
            Action::ApproveScarce { token_id, account_id, msg } => {
                self.internal_approve(actor_id, &token_id, &account_id, msg)?;
                Ok(Value::Null)
            }
            Action::RevokeScarce { token_id, account_id } => {
                self.internal_revoke(actor_id, &token_id, &account_id)?;
                Ok(Value::Null)
            }
            Action::RevokeAllScarce { token_id } => {
                self.internal_revoke_all(actor_id, &token_id)?;
                Ok(Value::Null)
            }

            // ── Token Lifecycle ───────────────────────────────────────
            Action::RenewToken { token_id, collection_id, new_expires_at } => {
                self.internal_renew_token(actor_id, &token_id, &collection_id, new_expires_at)?;
                Ok(Value::Null)
            }
            Action::RevokeToken { token_id, collection_id, memo } => {
                self.internal_revoke_token(actor_id, &token_id, &collection_id, memo)?;
                Ok(Value::Null)
            }
            Action::RedeemToken { token_id, collection_id } => {
                self.internal_redeem_token(actor_id, &token_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::ClaimRefund { token_id, collection_id } => {
                self.internal_claim_refund(actor_id, &token_id, &collection_id)?;
                Ok(Value::Null)
            }
            Action::BurnScarce { token_id, collection_id } => {
                self.internal_burn_scarce(actor_id, &token_id, &collection_id)?;
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

            // ── Allowlist ────────────────────────────────────────────
            Action::SetAllowlist { collection_id, entries } => {
                self.internal_set_allowlist(actor_id, &collection_id, entries)?;
                Ok(Value::Null)
            }
            Action::RemoveFromAllowlist { collection_id, accounts } => {
                self.internal_remove_from_allowlist(actor_id, &collection_id, accounts)?;
                Ok(Value::Null)
            }

            // ── Admin ────────────────────────────────────────────────
            Action::SetFeeRecipient { fee_recipient } => {
                if actor_id != &self.owner_id {
                    return Err(MarketplaceError::Unauthorized("Only owner".into()));
                }
                self.fee_recipient = fee_recipient;
                Ok(Value::Null)
            }
            Action::UpdateFeeConfig {
                total_fee_bps,
                app_pool_fee_bps,
            } => {
                if actor_id != &self.owner_id {
                    return Err(MarketplaceError::Unauthorized("Only owner".into()));
                }
                self.internal_update_fee_config(total_fee_bps, app_pool_fee_bps)?;
                Ok(Value::Null)
            }

            // ── App Pool ─────────────────────────────────────────────
            Action::RegisterApp { app_id, max_user_bytes, default_royalty, primary_sale_bps, metadata } => {
                self.internal_register_app(actor_id, &app_id, max_user_bytes, default_royalty, primary_sale_bps, metadata)?;
                Ok(Value::Null)
            }
            Action::SetAppConfig { app_id, max_user_bytes, default_royalty, primary_sale_bps, metadata } => {
                self.internal_set_app_config(actor_id, &app_id, max_user_bytes, default_royalty, primary_sale_bps, metadata)?;
                Ok(Value::Null)
            }

            // ── Collection Metadata ──────────────────────────────────
            Action::SetCollectionMetadata { collection_id, metadata } => {
                self.internal_set_collection_metadata(actor_id, &collection_id, metadata)?;
                Ok(Value::Null)
            }
        }
    }
}
