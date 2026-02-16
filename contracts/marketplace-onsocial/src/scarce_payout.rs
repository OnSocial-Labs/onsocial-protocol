// NEP-199 Payout API Implementation
//
// Extracted from scarce_core.rs to separate royalty payout logic
// from NEP-171 core token mechanics.

use crate::internal::check_one_yocto;
use crate::*;

#[near]
impl Contract {
    /// Calculate payout for a given balance (NEP-199).
    /// Returns how the balance should be split between owner and royalty recipients.
    #[handle_result]
    pub fn nft_payout(
        &self,
        token_id: String,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Result<Payout, MarketplaceError> {
        let token = self.scarces_by_id.get(&token_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("Token not found: {}", token_id))
        })?;
        self.internal_compute_payout(token, balance.0, max_len_payout.unwrap_or(10))
    }

    /// Transfer token and return payout (NEP-199).
    /// Used by marketplaces to distribute sale proceeds with royalties.
    #[payable]
    #[handle_result]
    pub fn nft_transfer_payout(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        approval_id: Option<u64>,
        memo: Option<String>,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Result<Payout, MarketplaceError> {
        check_one_yocto()?;
        let sender_id = env::predecessor_account_id();

        let token = self.scarces_by_id.get(&token_id).ok_or_else(|| {
            MarketplaceError::NotFound(format!("Token not found: {}", token_id))
        })?.clone();
        let payout = self.internal_compute_payout(&token, balance.0, max_len_payout.unwrap_or(10))?;

        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)?;

        Ok(payout)
    }
}

impl Contract {
    /// Compute payout split: royalty recipients get their bps, owner gets remainder.
    pub(crate) fn internal_compute_payout(&self, token: &Scarce, balance: u128, max_len: u32) -> Result<Payout, MarketplaceError> {
        let mut payout_map = std::collections::HashMap::new();
        let mut total_royalty: u128 = 0;

        if let Some(ref royalty) = token.royalty {
            if (royalty.len() as u32) + 1 > max_len {
                return Err(MarketplaceError::InvalidInput(
                    "Royalty recipients + owner exceed max_len_payout".to_string(),
                ));
            }
            for (account, bps) in royalty.iter() {
                let amount = (balance * (*bps as u128)) / 10_000;
                if amount > 0 {
                    payout_map.insert(account.clone(), U128(amount));
                    total_royalty += amount;
                }
            }
        }

        // Owner gets the remainder
        let owner_amount = balance.saturating_sub(total_royalty);
        if owner_amount > 0 {
            // If owner already in royalty map, add to their share
            payout_map
                .entry(token.owner_id.clone())
                .and_modify(|v| v.0 += owner_amount)
                .or_insert(U128(owner_amount));
        }

        Ok(Payout { payout: payout_map })
    }
}
