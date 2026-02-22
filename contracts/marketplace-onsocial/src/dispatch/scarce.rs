//! Dispatch arms for scarce-token operations (mint, transfer, approve, burn, lifecycle).

use crate::*;
use near_sdk::serde_json::Value;

impl Contract {
    pub(super) fn dispatch_scarce(
        &mut self,
        action: Action,
        actor_id: &AccountId,
    ) -> Result<Value, MarketplaceError> {
        match action {
            Action::QuickMint { metadata, options } => {
                let token_id = self.internal_quick_mint(actor_id, metadata, options)?;
                Ok(Value::String(token_id))
            }
            Action::TransferScarce {
                receiver_id,
                token_id,
                memo,
            } => {
                self.internal_transfer(actor_id, &receiver_id, &token_id, None, memo)?;
                Ok(Value::Null)
            }
            Action::BatchTransfer { transfers } => {
                self.internal_batch_transfer(actor_id, transfers)?;
                Ok(Value::Null)
            }
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
            Action::BurnScarce {
                token_id,
                collection_id,
            } => {
                match collection_id {
                    Some(cid) => self.internal_burn_scarce(actor_id, &token_id, &cid)?,
                    None => {
                        // "s:" is a reserved prefix for standalone tokens (QuickMint
                        // and lazy-listing purchases). Route to standalone burn.
                        let cid = crate::collection_id_from_token_id(&token_id);
                        if cid.is_empty() || cid == "s" {
                            self.internal_burn_standalone(actor_id, &token_id)?
                        } else {
                            self.internal_burn_scarce(actor_id, &token_id, cid)?
                        }
                    }
                }
                Ok(Value::Null)
            }
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
            _ => unreachable!("dispatch_scarce called with non-scarce action"),
        }
    }
}
