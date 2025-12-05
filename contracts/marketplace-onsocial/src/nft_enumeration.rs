// NEP-181 Enumeration Implementation
// Query native tokens by owner, pagination support

use crate::*;
use near_sdk::json_types::U128;

#[near]
impl Contract {
    /// Get total supply of native NFTs (NEP-181)
    pub fn nft_total_supply(&self) -> U128 {
        // Count all tokens in native_tokens_by_id
        U128(self.native_tokens_by_id.len() as u128)
    }
    
    /// Get paginated list of all native tokens (NEP-181)
    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<external::Token> {
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;
        
        self.native_tokens_by_id
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
        self.native_tokens_per_owner
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
        let tokens_set = match self.native_tokens_per_owner.get(&account_id) {
            Some(set) => set,
            None => return vec![],
        };
        
        let start = from_index.map(|i| i.0 as usize).unwrap_or(0);
        let limit = limit.unwrap_or(50).min(100) as usize;
        
        tokens_set
            .iter()
            .skip(start)
            .take(limit)
            .filter_map(|token_id| {
                self.native_tokens_by_id.get(token_id.as_str()).map(|token| {
                    external::Token {
                        token_id: token_id.clone(),
                        owner_id: token.owner_id.clone(),
                        metadata: Some(token.metadata.clone()),
                        approved_account_ids: Some(token.approved_account_ids.clone()),
                    }
                })
            })
            .collect()
    }
}
