use near_sdk::borsh::{BorshSerialize, BorshDeserialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum MarketplaceError {
    Unauthorized,
    MissingInput,
}

impl FunctionError for MarketplaceError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("MarketplaceError: {:?}", self))
    }
}