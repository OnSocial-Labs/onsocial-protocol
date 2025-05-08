use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingError {
    Unauthorized,
    MissingInput,
}

impl FunctionError for StakingError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("StakingError: {:?}", self))
    }
}