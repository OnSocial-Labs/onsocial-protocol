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
        max_len: Option<u32>,
    ) -> Result<Payout, MarketplaceError> {
        let mut payout_map = HashMap::new();
        let mut total_royalty: u128 = 0;

        if let Some(royalty) = &token.royalty {
            for (account, bps) in royalty.iter() {
                let amount = (primitive_types::U256::from(balance)
                    * primitive_types::U256::from(*bps)
                    / primitive_types::U256::from(10_000u32))
                .as_u128();
                if amount > 0 {
                    payout_map.insert(account.clone(), U128(amount));
                    total_royalty = total_royalty.checked_add(amount).ok_or_else(|| {
                        MarketplaceError::InternalError("Royalty payout overflow".to_string())
                    })?;
                }
            }
        }

        if total_royalty > balance {
            return Err(MarketplaceError::InvalidInput(
                "Royalty payout exceeds balance".to_string(),
            ));
        }

        let owner_amount = balance - total_royalty;
        if owner_amount > 0 {
            payout_map
                .entry(seller_id.clone())
                .and_modify(|v| v.0 += owner_amount)
                .or_insert(U128(owner_amount));
        }

        if let Some(max_len) = max_len {
            if payout_map.len() > max_len as usize {
                return Err(MarketplaceError::InvalidInput(
                    "Payout exceeds max_len_payout".to_string(),
                ));
            }
        }

        Ok(Payout { payout: payout_map })
    }

    pub(crate) fn payout_total(payout: &Payout) -> Option<u128> {
        payout
            .payout
            .values()
            .try_fold(0u128, |total, amount| total.checked_add(amount.0))
    }
}
#[near(serializers = [json])]
pub struct Payout {
    pub payout: std::collections::HashMap<AccountId, U128>,
}
