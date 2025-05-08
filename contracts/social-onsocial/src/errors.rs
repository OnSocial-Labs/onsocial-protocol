use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum SocialError {
    Unauthorized,
    MissingInput,
}

impl FunctionError for SocialError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("SocialError: {:?}", self))
    }
}