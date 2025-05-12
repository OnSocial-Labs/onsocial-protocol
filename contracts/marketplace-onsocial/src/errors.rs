use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum MarketplaceError {
    Unauthorized,
    MissingInput,
    InsufficientBalance,
    InvalidItem,
}

impl FunctionError for MarketplaceError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("MarketplaceError: {:?}", self))
    }
}
