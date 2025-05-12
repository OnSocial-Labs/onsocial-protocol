use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum StakingError {
    Unauthorized,
    MissingInput,
    InsufficientBalance,
    InvalidStake,
}

impl FunctionError for StakingError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("StakingError: {:?}", self))
    }
}
