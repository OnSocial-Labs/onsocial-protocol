use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, FunctionError};

#[derive(Debug, PartialEq, BorshSerialize, BorshDeserialize)]
pub enum SocialError {
    Unauthorized,
    MissingInput,
    InvalidPost,
    PostNotFound,
}

impl FunctionError for SocialError {
    fn panic(&self) -> ! {
        env::panic_str(&format!("SocialError: {:?}", self))
    }
}
