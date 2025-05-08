use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::AccountId;

#[derive(BorshSerialize, BorshDeserialize)]
pub struct StateV010 {
    pub version: String,
    pub manager: AccountId,
}