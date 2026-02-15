//! Collection purchase — mint scarces from lazy collections with split-fee.

use crate::*;
use near_sdk::require;

#[near]
impl Contract {
    /// Purchase and mint scarces from a lazy collection.
    /// Atomic: update count → pay → mint → refund.
    #[payable]
    pub fn purchase_from_collection(
        &mut self,
        collection_id: String,
        quantity: u32,
        max_price_per_token: Option<U128>,
        _mint_gas_tgas: Option<u64>,
    ) {
        require!(
            quantity > 0 && quantity <= MAX_BATCH_MINT,
            format!("Quantity must be 1-{}", MAX_BATCH_MINT)
        );

        let collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();

        require!(
            self.is_collection_active(&collection),
            "Collection is not active for minting"
        );

        let available = collection.total_supply - collection.minted_count;
        require!(
            available >= quantity,
            format!("Only {} items remaining", available)
        );

        if let Some(max_price) = max_price_per_token {
            require!(
                collection.price_near.0 <= max_price.0,
                format!(
                    "Price per token ({}) exceeds maximum allowed ({})",
                    collection.price_near.0, max_price.0
                )
            );
        }

        let total_price = collection.price_near.0 * quantity as u128;
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= total_price,
            format!("Insufficient payment: required {}, got {}", total_price, deposit)
        );

        let buyer_id = env::predecessor_account_id();
        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let creator_id = collection.creator_id.clone();

        let token_ids: Vec<String> = (start_index..start_index + quantity)
            .map(|i| format!("{}:{}", collection_id, i + 1))
            .collect();

        // Update count FIRST (reentrancy protection)
        let mut updated_collection = collection.clone();
        updated_collection.minted_count += quantity;
        self.collections
            .insert(collection_id.clone(), updated_collection);

        // Split fee: revenue to platform + portion to sponsor fund
        let (revenue, sponsor_amount) = self.route_fee(total_price);
        let total_fee = revenue + sponsor_amount;
        let creator_payment = total_price.saturating_sub(total_fee);

        // Pay creator
        if creator_payment > 0 {
            let _ = Promise::new(creator_id.clone()).transfer(NearToken::from_yoctonear(creator_payment));
        }

        // Mint tokens
        let _minted = self.internal_batch_mint(
            &buyer_id,
            token_ids,
            &metadata_template,
            &collection_id,
        );

        // Refund excess
        let refund = deposit - total_price;
        if refund > 0 {
            let _ = Promise::new(buyer_id.clone()).transfer(NearToken::from_yoctonear(refund));
        }

        events::emit_collection_purchase(
            &buyer_id,
            &creator_id,
            &collection_id,
            quantity,
            U128(total_price),
            U128(revenue),
            U128(sponsor_amount),
        );
    }

    pub fn get_collection_price(&self, collection_id: String) -> U128 {
        self.collections
            .get(&collection_id)
            .expect("Collection not found")
            .price_near
    }

    pub fn calculate_collection_purchase_price(
        &self,
        collection_id: String,
        quantity: u32,
    ) -> U128 {
        let collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found");
        U128(collection.price_near.0 * quantity as u128)
    }
}
