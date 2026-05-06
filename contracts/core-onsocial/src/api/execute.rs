use crate::{Request, SocialError, permission_denied};
use near_sdk::{near, serde_json::Value};

use crate::api::guards::ContractGuards;
use crate::{Contract, ContractExt};

#[near]
impl Contract {
    /// User-facing entry point for direct calls and session keys targeting `execute`.
    /// Rejects actions marked `requires_full_access()`; those must use [`Self::execute_admin`].
    #[payable]
    #[handle_result]
    pub fn execute(&mut self, request: Request) -> Result<Value, SocialError> {
        ContractGuards::require_live_state(&self.platform)?;

        if request.action.requires_full_access() {
            return Err(permission_denied!(
                "admin_action",
                request.action.action_type()
            ));
        }

        self.platform.execute(request)
    }

    /// Full-access entry point for privileged actions rejected by [`Self::execute`].
    #[payable]
    #[handle_result]
    pub fn execute_admin(&mut self, request: Request) -> Result<Value, SocialError> {
        ContractGuards::require_live_state(&self.platform)?;
        self.platform.execute(request)
    }
}
