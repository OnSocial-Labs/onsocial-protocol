// NEP-181 Enumeration Implementation

use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
    /// Get total supply of native Scarces (NEP-181)
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.scarces_by_id.len() as u128)
    }

    /// Get paginated list of all native Scarces (NEP-181)
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<external::Token> {
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;

        self.scarces_by_id
            .iter()
            .skip(start)
            .take(limit)
            .map(|(token_id, token)| external::Token {
                token_id: token_id.clone(),
                owner_id: token.owner_id.clone(),
                metadata: Some(token.metadata.clone()),
                approved_account_ids: Some(token.approved_account_ids.clone()),
            })
            .collect()
    }

    /// Get number of tokens owned by account (NEP-181)
    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.scarces_per_owner
            .get(&account_id)
            .map(|tokens| U128(tokens.len() as u128))
            .unwrap_or(U128(0))
    }

    /// Get paginated list of tokens for an owner (NEP-181)
    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<external::Token> {
        let tokens_set = match self.scarces_per_owner.get(&account_id) {
            Some(set) => set,
            None => return vec![],
        };

        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;

        tokens_set
            .iter()
            .skip(start)
            .filter_map(|token_id| {
                self.scarces_by_id
                    .get(token_id.as_str())
                    .map(|token| external::Token {
                        token_id: token_id.clone(),
                        owner_id: token.owner_id.clone(),
                        metadata: Some(token.metadata.clone()),
                        approved_account_ids: Some(token.approved_account_ids.clone()),
                    })
            })
            .take(limit)
            .collect()
    }

    /// Get total supply of tokens in a specific collection.
    pub fn nft_supply_for_collection(&self, collection_id: String) -> U128 {
        self.collections
            .get(&collection_id)
            .map(|c| U128(c.minted_count as u128))
            .unwrap_or(U128(0))
    }

    /// Get paginated list of tokens in a specific collection.
    pub fn nft_tokens_for_collection(
        &self,
        collection_id: String,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<external::Token> {
        let collection = match self.collections.get(&collection_id) {
            Some(c) => c,
            None => return vec![],
        };
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;

        // Token IDs follow the invariant `{collection_id}:{serial}` (1-based, set at mint).
        // filter_map skips serials whose tokens have been burned (removed from storage).
        (1..=collection.total_supply)
            .filter_map(|serial| {
                let token_id = format!("{}:{}", collection_id, serial);
                self.scarces_by_id.get(token_id.as_str()).map(|token| external::Token {
                    token_id: token_id.clone(),
                    owner_id: token.owner_id.clone(),
                    metadata: Some(token.metadata.clone()),
                    approved_account_ids: Some(token.approved_account_ids.clone()),
                })
            })
            .skip(start)
            .take(limit)
            .collect()
    }
}
