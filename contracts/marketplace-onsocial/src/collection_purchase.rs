// Collection Purchase
// Purchase and mint tokens from lazy collections

use crate::*;
use near_sdk::require;

#[near]
impl Contract {
    /// Purchase and mint tokens from a lazy collection
    /// This is atomic: mint + payment in one transaction
    /// Optional gas override for minting operations (useful for large batches)
    #[payable]
    pub fn purchase_from_collection(
        &mut self,
        collection_id: String,
        quantity: u32,
        max_price_per_token: Option<U128>, // Slippage protection
        _mint_gas_tgas: Option<u64>, // Reserved for future use if needed
    ) {
        require!(
            quantity > 0 && quantity <= MAX_BATCH_MINT,
            format!("Quantity must be 1-{}", MAX_BATCH_MINT)
        );
        
        // Get collection and extract needed data
        let collection = self
            .collections
            .get(&collection_id)
            .expect("Collection not found")
            .clone();
        
        // Check if collection is active (inline to avoid borrow issues)
        let now = env::block_timestamp();
        let not_sold_out = collection.minted_count < collection.total_supply;
        let started = collection.start_time.map_or(true, |start| now >= start);
        let not_ended = collection.end_time.map_or(true, |end| now <= end);
        require!(
            not_sold_out && started && not_ended,
            "Collection is not active for minting"
        );
        
        // Check availability
        let available = collection.total_supply - collection.minted_count;
        require!(
            available >= quantity,
            format!("Only {} items remaining", available)
        );
        
        // Slippage protection: verify price hasn't changed beyond buyer's tolerance
        if let Some(max_price) = max_price_per_token {
            require!(
                collection.price_near.0 <= max_price.0,
                format!(
                    "Price per token ({}) exceeds maximum allowed ({})",
                    collection.price_near.0, max_price.0
                )
            );
        }
        
        // Check payment
        let total_price = collection.price_near.0 * quantity as u128;
        let deposit = env::attached_deposit().as_yoctonear();
        require!(
            deposit >= total_price,
            format!("Insufficient payment: required {} yoctoNEAR, got {}", total_price, deposit)
        );
        
        let buyer_id = env::predecessor_account_id();
        let start_index = collection.minted_count;
        let metadata_template = collection.metadata_template.clone();
        let creator_id = collection.creator_id.clone();
        
        // Generate token IDs for this batch
        let token_ids: Vec<String> = (start_index..start_index + quantity)
            .map(|i| format!("{}:{}", collection_id, i + 1))
            .collect();
        
        // Update minted count FIRST (prevents reentrancy)
        let mut updated_collection = collection.clone();
        updated_collection.minted_count += quantity;
        self.collections.insert(collection_id.clone(), updated_collection);
        
        // Calculate and distribute payment BEFORE minting (reentrancy protection)
        let marketplace_fee = (total_price * MARKETPLACE_FEE_BPS as u128) / BASIS_POINTS as u128;
        let creator_payment = total_price - marketplace_fee;
        
        // Pay creator first (before any external calls can reenter)
        if creator_payment > 0 {
            Promise::new(creator_id.clone())
                .transfer(NearToken::from_yoctonear(creator_payment));
        }
        
        // Pay marketplace fee
        if marketplace_fee > 0 {
            Promise::new(self.fee_recipient.clone())
                .transfer(NearToken::from_yoctonear(marketplace_fee));
        }
        
        // NOW mint tokens - state is already updated and payments sent
        let minted_tokens = self.internal_batch_mint(
            &buyer_id,
            token_ids.clone(),
            &metadata_template,
            &collection_id,
        );
        
        // Refund excess payment if any
        let refund = deposit - total_price;
        if refund > 0 {
            Promise::new(buyer_id.clone())
                .transfer(NearToken::from_yoctonear(refund));
        }
        
        // Emit event
        crate::events::emit_collection_purchase_event(
            &buyer_id,
            &creator_id,
            &collection_id,
            quantity,
            U128(total_price),
            U128(marketplace_fee),
        );
        
        env::log_str(&format!(
            "Collection purchase: {} minted {} items from {} for {} yoctoNEAR (fee: {})",
            buyer_id, quantity, collection_id, total_price, marketplace_fee
        ));
        
        // Log minted token IDs
        env::log_str(&format!(
            "Minted tokens: {:?}",
            minted_tokens
        ));
    }
    
    /// Get current price for a collection in NEAR
    /// This allows frontend to convert Currency prices using onsocial-intents
    pub fn get_collection_price(&self, collection_id: String) -> U128 {
        self.collections
            .get(&collection_id)
            .expect("Collection not found")
            .price_near
    }
    
    /// Calculate total price for quantity
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
