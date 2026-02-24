use crate::*;
use std::collections::HashMap;

impl Contract {
    // Invariant: app default royalty is always included; overlapping recipients are additive.
    pub(crate) fn merge_royalties(
        &self,
        app_id: Option<&AccountId>,
        creator_royalty: Option<HashMap<AccountId, u32>>,
    ) -> Result<Option<HashMap<AccountId, u32>>, MarketplaceError> {
        let app_royalty = app_id
            .and_then(|id| self.app_pools.get(id))
            .and_then(|pool| pool.default_royalty.clone());

        let result = match (app_royalty, creator_royalty) {
            (None, None) => None,
            (Some(app), None) => Some(app),
            (None, Some(creator)) => Some(creator),
            (Some(app), Some(creator)) => {
                let mut merged = app;
                for (account, bps) in creator {
                    let entry = merged.entry(account).or_insert(0);
                    *entry += bps;
                }
                Some(merged)
            }
        };

        if let Some(ref r) = result {
            crate::validation::validate_royalty(r)?;
        }

        Ok(result)
    }

    // Token accounting invariant: seller_id is the payout sink for residual value.
    pub(crate) fn compute_payout(
        &self,
        token: &Scarce,
        seller_id: &AccountId,
        balance: u128,
        max_len: u32,
    ) -> Result<Payout, MarketplaceError> {
        let mut payout_map = HashMap::new();
        let mut total_royalty: u128 = 0;

        if let Some(royalty) = &token.royalty {
            let seller_in_royalty = royalty.contains_key(seller_id);
            let distinct_entries = if seller_in_royalty {
                royalty.len() as u32
            } else {
                royalty.len() as u32 + 1
            };
            if distinct_entries > max_len {
                return Err(MarketplaceError::InvalidInput(
                    "Royalty recipients + owner exceed max_len_payout".to_string(),
                ));
            }
            for (account, bps) in royalty.iter() {
                let amount = balance.checked_mul(*bps as u128).ok_or_else(|| {
                    MarketplaceError::InternalError("Royalty payout overflow".to_string())
                })? / 10_000;
                if amount > 0 {
                    payout_map.insert(account.clone(), U128(amount));
                    total_royalty += amount;
                }
            }
        }

        let owner_amount = balance.saturating_sub(total_royalty);
        if owner_amount > 0 {
            payout_map
                .entry(seller_id.clone())
                .and_modify(|v| v.0 += owner_amount)
                .or_insert(U128(owner_amount));
        }

        Ok(Payout { payout: payout_map })
    }
}
#[near(serializers = [json])]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}
