use crate::*;
use near_sdk::{json_types::U128, require};

fn pagination_start(from_index: Option<U128>) -> u128 {
    from_index.map(From::from).unwrap_or_default()
}

fn pagination_limit(limit: Option<u64>) -> usize {
    let limit = limit
        .and_then(|value| usize::try_from(value).ok())
        .unwrap_or(usize::MAX);
    require!(limit != 0, "Cannot provide limit of 0.");
    limit
}

#[near]
impl Contract {
    pub fn nft_total_supply(&self) -> U128 {
        U128(self.scarces_by_id.len() as u128)
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<external::Token> {
        let start_index = pagination_start(from_index);
        require!(
            self.scarces_by_id.len() as u128 >= start_index,
            "Out of bounds, please use a smaller from_index."
        );
        let start = start_index as usize;
        let limit = pagination_limit(limit);

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

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.scarces_per_owner
            .get(&account_id)
            .map(|tokens| U128(tokens.len() as u128))
            .unwrap_or(U128(0))
    }

    pub fn nft_tokens_for_owner(
        &self,
        account_id: AccountId,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<external::Token> {
        let Some(tokens_set) = self.scarces_per_owner.get(&account_id) else {
            return vec![];
        };
        if tokens_set.is_empty() {
            return vec![];
        }

        let start_index = pagination_start(from_index);
        require!(
            tokens_set.len() as u128 > start_index,
            "Out of bounds, please use a smaller from_index."
        );
        let start = start_index as usize;
        let limit = pagination_limit(limit);

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

    pub fn nft_supply_for_collection(&self, collection_id: String) -> U128 {
        self.collections
            .get(&collection_id)
            .map(|c| U128(c.minted_count as u128))
            .unwrap_or(U128(0))
    }

    pub fn nft_tokens_for_collection(
        &self,
        collection_id: String,
        from_index: Option<U128>,
        limit: Option<u64>,
    ) -> Vec<external::Token> {
        let Some(collection) = self.collections.get(&collection_id) else {
            return vec![];
        };
        let start_index = pagination_start(from_index);
        require!(
            collection.minted_count as u128 >= start_index,
            "Out of bounds, please use a smaller from_index."
        );
        let start = start_index as usize;
        let limit = pagination_limit(limit);

        // Token state invariant: IDs are `{collection_id}:{serial}` (1-based); absent entries represent burned tokens.
        (1..=collection.total_supply)
            .filter_map(|serial| {
                let token_id = format!("{}:{}", collection_id, serial);
                self.scarces_by_id
                    .get(token_id.as_str())
                    .map(|token| external::Token {
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
