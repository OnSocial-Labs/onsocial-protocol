use crate::{Request, SocialError};
use near_sdk::{near, serde_json::Value};

use crate::api::guards::ContractGuards;
use crate::{Contract, ContractExt};

#[near]
impl Contract {
    /// Unified entry point for all authenticated operations.
    ///
    /// Supports all 4 auth models:
    /// - `Direct`: User signs transaction directly
    /// - `SignedPayload`: Off-chain signed payload (for relayer)
    /// - `DelegateAction`: NEP-366 meta-transactions
    /// - `Intent`: Intent executor pattern
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        self.platform.execute(request)
    }
}
