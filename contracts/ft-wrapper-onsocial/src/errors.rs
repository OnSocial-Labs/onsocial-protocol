use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::FunctionError;
use near_sdk_macros::NearSchema;

#[derive(Debug, NearSchema, BorshSerialize, BorshDeserialize)]
#[abi(borsh)]
pub enum FtWrapperError {
    TokenNotSupported,
    AmountTooLow,
    InvalidDeposit,
    AccountNotRegistered,
    InsufficientStorageBalance,
    NonZeroBalance,
    Unauthorized,
    LowBalance,
}

impl FunctionError for FtWrapperError {
    fn panic(&self) -> ! {
        panic!(
            "{}",
            match self {
                FtWrapperError::TokenNotSupported => "Token not supported",
                FtWrapperError::AmountTooLow => "Amount too low",
                FtWrapperError::InvalidDeposit => "Invalid deposit amount",
                FtWrapperError::AccountNotRegistered => "Account not registered",
                FtWrapperError::InsufficientStorageBalance => "Insufficient storage balance",
                FtWrapperError::NonZeroBalance => "Non-zero token balance",
                FtWrapperError::Unauthorized => "Unauthorized access",
                FtWrapperError::LowBalance => "Contract balance too low",
            }
        )
    }
}
