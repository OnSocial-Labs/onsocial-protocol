use crate::guards::check_one_yocto;
use crate::*;

#[near]
impl Contract {
    #[handle_result]
    pub fn nft_payout(
        &self,
        token_id: String,
        balance: U128,
        max_len_payout: Option<u32>,
    ) -> Result<Payout, MarketplaceError> {
        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("Token not found: {}", token_id)))?;
        self.internal_compute_payout(
            token,
            &token.owner_id,
            balance.0,
            max_len_payout.unwrap_or(10),
        )
    }

    #[payable]
    #[handle_result]
    /// Caller must be the token owner or an approved account; requires exactly 1 yoctoNEAR attached.
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

        let token = self
            .scarces_by_id
            .get(&token_id)
            .ok_or_else(|| MarketplaceError::NotFound(format!("Token not found: {}", token_id)))?
            .clone();
        let payout = self.internal_compute_payout(
            &token,
            &token.owner_id,
            balance.0,
            max_len_payout.unwrap_or(10),
        )?;

        self.internal_transfer(&sender_id, &receiver_id, &token_id, approval_id, memo)?;

        Ok(payout)
    }
}
