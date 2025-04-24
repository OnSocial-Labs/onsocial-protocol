use near_sdk::{env, FunctionError};
use near_sdk_macros::NearSchema;
use near_sdk::borsh::{BorshSerialize, BorshDeserialize};

#[derive(Debug, PartialEq, NearSchema, BorshSerialize, BorshDeserialize)]
#[abi(borsh)]
pub enum AuthError {
    Unauthorized,
    KeyNotFound,
    KeyAlreadyExists,
    AccountStillActive,
    MissingInput,
}

impl FunctionError for AuthError {
    fn panic(&self) -> ! {
        env::panic_str(match self {
            AuthError::Unauthorized => "Unauthorized access",
            AuthError::KeyNotFound => "Key not found",
            AuthError::KeyAlreadyExists => "Key already exists",
            AuthError::AccountStillActive => "Account is still active",
            AuthError::MissingInput => "No input provided",
        })
    }
}