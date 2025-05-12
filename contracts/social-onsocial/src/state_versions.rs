use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::AccountId;
use near_sdk_macros::NearSchema;

#[derive(BorshSerialize, BorshDeserialize, NearSchema)]
#[abi(borsh)]
pub struct StateV010 {
    pub version: String,
    pub manager: AccountId,
}
