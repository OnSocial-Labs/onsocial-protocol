use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::{env, FunctionError};

#[derive(BorshSerialize, BorshDeserialize, Debug, PartialEq)]
pub enum RelayerError {
    Unauthorized,         // 0
    InsufficientBalance,  // 1
    InvalidInput(String), // 2
    MissingInput,         // 3
    InvalidState,         // 4
    ReentrancyDetected,   // 5
    TransactionExpired,   // 6
    SerializationError,   // 7
    Paused,               // 8
}

impl RelayerError {
    pub fn code(&self) -> u8 {
        match self {
            RelayerError::Unauthorized => 0,
            RelayerError::InsufficientBalance => 1,
            RelayerError::InvalidInput(_) => 2,
            RelayerError::MissingInput => 3,
            RelayerError::InvalidState => 4,
            RelayerError::ReentrancyDetected => 5,
            RelayerError::TransactionExpired => 6,
            RelayerError::SerializationError => 7,
            RelayerError::Paused => 8,
        }
    }

    pub fn subcode(&self) -> u8 {
        0
    }

    pub fn reason(&self) -> Option<&str> {
        match self {
            RelayerError::InvalidInput(reason) => Some(reason.as_str()),
            _ => None,
        }
    }
}

impl FunctionError for RelayerError {
    fn panic(&self) -> ! {
        let reason = self.reason().unwrap_or("");
        env::log_str(&format!(
            "{{\"c\":{},\"s\":{},\"t\":{},\"r\":\"{}\"}}",
            self.code(),
            self.subcode(),
            env::block_timestamp_ms(),
            reason
        ));
        env::panic_str("RE")
    }
}
